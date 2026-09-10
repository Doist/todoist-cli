import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeFixtureExtension } from '../../test-support/extension-fixture.js'
import { buildExtensionEnv, buildSpawnPlan, dispatchExtension } from './dispatch.js'
import type { Extension } from './types.js'

function asExtension(dir: string, name: string): Extension {
    return {
        name,
        dirName: `td-${name}`,
        kind: 'git',
        dir,
        entryPath: dir,
        executablePath: join(dir, `td-${name}`),
        pinned: false,
        official: false,
    }
}

describe('buildSpawnPlan', () => {
    let root: string

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'td-ext-spawn-'))
    })

    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })

    it('runs a node-shebang script with the host’s own node', async () => {
        const dir = await writeFixtureExtension(root, 'goals')
        const plan = await buildSpawnPlan(join(dir, 'td-goals'), ['list'])

        expect(plan.command).toBe(process.execPath)
        expect(plan.args).toEqual([join(dir, 'td-goals'), 'list'])
    })

    it('runs any other executable directly on POSIX', async () => {
        const dir = await writeFixtureExtension(root, 'shell', { interpreter: 'sh' })
        const plan = await buildSpawnPlan(join(dir, 'td-shell'), ['a', 'b'])

        expect(plan.command).toBe(join(dir, 'td-shell'))
        expect(plan.args).toEqual(['a', 'b'])
    })

    it('refuses an executable that has not been built or made executable', async () => {
        const dir = await writeFixtureExtension(root, 'compiled', { notExecutable: true })

        await expect(buildSpawnPlan(join(dir, 'td-compiled'), [])).rejects.toMatchObject({
            code: 'EXTENSION_NOT_EXECUTABLE',
        })
    })

    it('refuses when the executable is missing entirely', async () => {
        await expect(buildSpawnPlan(join(root, 'td-ghost', 'td-ghost'), [])).rejects.toMatchObject({
            code: 'EXTENSION_NOT_EXECUTABLE',
        })
    })
})

describe('buildExtensionEnv', () => {
    const extension = asExtension('/ext/td-goals', 'goals')

    const build = (overrides: Partial<Parameters<typeof buildExtensionEnv>[0]> = {}) =>
        buildExtensionEnv({
            envPrefix: 'TD',
            version: '5.3.1',
            configDir: '/config/todoist-cli',
            hostPath: '/usr/lib/td/dist/index.js',
            extension,
            ...overrides,
        })

    it('sets the documented contract', () => {
        const env = build()

        expect(env.TD_EXTENSION).toBe('1')
        expect(env.TD_EXTENSION_NAME).toBe('goals')
        expect(env.TD_EXTENSION_DIR).toBe('/ext/td-goals')
        expect(env.TD_PATH).toBe('/usr/lib/td/dist/index.js')
        expect(env.TD_NODE).toBe(process.execPath)
        expect(env.TD_VERSION).toBe('5.3.1')
        expect(env.TD_CONFIG_DIR).toBe('/config/todoist-cli')
    })

    it('never puts an API token in the child environment', () => {
        const env = build()
        expect(env.TD_TOKEN).toBeUndefined()
        expect(env.TD_API_TOKEN).toBeUndefined()
    })

    it('forwards --user only when one was given before the command token', () => {
        expect(build().TD_USER).toBeUndefined()
        expect(build({ user: 'alice@example.com' }).TD_USER).toBe('alice@example.com')
    })

    it('marks accessible mode so nested calls inherit it', () => {
        expect(build().TD_ACCESSIBLE).toBeUndefined()
        expect(build({ accessible: true }).TD_ACCESSIBLE).toBe('1')
    })

    it('uses a different prefix for a different host CLI', () => {
        const env = buildExtensionEnv({
            envPrefix: 'TDC',
            version: '1.0.0',
            configDir: '/config/comms-cli',
            hostPath: '/usr/lib/tdc/index.js',
            extension,
        })
        expect(env.TDC_EXTENSION).toBe('1')
        expect(env.TD_EXTENSION).toBe(process.env.TD_EXTENSION)
    })
})

describe('dispatchExtension', () => {
    let root: string
    let reportPath: string

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'td-ext-dispatch-'))
        reportPath = join(root, 'report.json')
    })

    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })

    async function run(args: string[], envOverrides: Record<string, string> = {}) {
        const dir = await writeFixtureExtension(root, 'goals')
        const extension = asExtension(dir, 'goals')
        const env = buildExtensionEnv({
            envPrefix: 'TD',
            version: '5.3.1',
            configDir: '/config',
            hostPath: '/host/index.js',
            extension,
            extra: { XX_REPORT: reportPath, ...envOverrides },
        })
        const code = await dispatchExtension(extension, args, env)
        return { code, extension }
    }

    async function report(): Promise<{ args: string[]; env: Record<string, string> }> {
        return JSON.parse(await readFile(reportPath, 'utf8'))
    }

    it('passes every argument through untouched, flags included', async () => {
        await run(['add', '--json', '-x', '--user', 'someone', '--', 'raw'])

        expect((await report()).args).toEqual([
            'add',
            '--json',
            '-x',
            '--user',
            'someone',
            '--',
            'raw',
        ])
    })

    it('hands the environment contract to the child process', async () => {
        await run([])

        const { env } = await report()
        expect(env.TD_EXTENSION).toBe('1')
        expect(env.TD_EXTENSION_NAME).toBe('goals')
        expect(env.TD_VERSION).toBe('5.3.1')
    })

    it('returns the exit code the extension chose', async () => {
        await expect(run(['--exit-code', '0'])).resolves.toMatchObject({ code: 0 })
        await expect(run(['--exit-code', '3'])).resolves.toMatchObject({ code: 3 })
        await expect(run(['--exit-code', '42'])).resolves.toMatchObject({ code: 42 })
    })
})
