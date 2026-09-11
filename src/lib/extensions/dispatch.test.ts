import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { writeFixtureExtension } from '../../test-support/extension-fixture.js'
import { buildExtensionEnv, buildSpawnPlan, dispatchExtension } from './dispatch.js'
import type { Extension } from './types.js'

const REAL_PLATFORM = process.platform

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

    it.skipIf(process.platform === 'win32')(
        'runs any other executable directly on POSIX',
        async () => {
            const dir = await writeFixtureExtension(root, 'shell', { interpreter: 'sh' })
            const plan = await buildSpawnPlan(join(dir, 'td-shell'), ['a', 'b'])

            expect(plan.command).toBe(join(dir, 'td-shell'))
            expect(plan.args).toEqual(['a', 'b'])
        },
    )

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

    beforeEach(() => {
        // The contract is about what this function adds, so start from a known
        // environment rather than whatever the machine running the tests has.
        for (const name of ['TD_USER', 'TD_ACCESSIBLE', 'TD_TOKEN', 'TD_API_TOKEN']) {
            vi.stubEnv(name, undefined)
        }
    })

    afterEach(() => {
        vi.unstubAllEnvs()
    })

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

    it('never injects a credential of its own', () => {
        const env = build()
        expect(env.TD_TOKEN).toBeUndefined()
        expect(env.TD_API_TOKEN).toBeUndefined()
    })

    it('passes through a token the user exported themselves', () => {
        // Documented in the spec as a deliberate exception: the CLI does not
        // inject secrets, but it does not scrub the environment either, and
        // stripping this would break nested calls for anyone who authenticates
        // this way.
        vi.stubEnv('TODOIST_API_TOKEN', 'user-exported-token')

        expect(build().TODOIST_API_TOKEN).toBe('user-exported-token')
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
        vi.stubEnv('TD_EXTENSION', undefined)

        const env = buildExtensionEnv({
            envPrefix: 'TDC',
            version: '1.0.0',
            configDir: '/config/comms-cli',
            hostPath: '/usr/lib/tdc/index.js',
            extension,
        })

        expect(env.TDC_EXTENSION).toBe('1')
        expect(env.TD_EXTENSION).toBeUndefined()
    })

    it('clears an inherited user rather than passing it on', () => {
        // Otherwise a nested call without --user would keep acting as the
        // account the outer call chose.
        vi.stubEnv('TD_USER', 'inherited@example.com')

        expect(build().TD_USER).toBeUndefined()
        expect(build({ user: 'alice@example.com' }).TD_USER).toBe('alice@example.com')
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
            env: { XX_REPORT: reportPath, ...envOverrides },
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

    it.skipIf(process.platform === 'win32')(
        'reports a child killed by a signal the way a shell does',
        async () => {
            const dir = await writeFixtureExtension(root, 'suicidal')
            await writeFile(
                join(dir, 'td-suicidal'),
                "#!/usr/bin/env node\nprocess.kill(process.pid, 'SIGKILL')\n",
            )
            await chmod(join(dir, 'td-suicidal'), 0o755)
            const extension = asExtension(dir, 'suicidal')

            // 128 + SIGKILL(9). Returning 0 here would make the host report
            // success after an extension was killed.
            await expect(dispatchExtension(extension, [], process.env)).resolves.toBe(137)
        },
    )

    it('returns the exit code the extension chose', async () => {
        await expect(run(['--exit-code', '0'])).resolves.toMatchObject({ code: 0 })
        await expect(run(['--exit-code', '3'])).resolves.toMatchObject({ code: 3 })
        await expect(run(['--exit-code', '42'])).resolves.toMatchObject({ code: 42 })
    })
})

describe('buildSpawnPlan on Windows', () => {
    let root: string

    // The Windows branches never run on CI, so drive them by declaring the
    // platform. Everything they touch is decided from the path and the
    // shebang, so no Windows filesystem behaviour is being faked.
    function asWindows(): void {
        Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    }

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'td-ext-spawn-win-'))
    })

    afterEach(async () => {
        Object.defineProperty(process, 'platform', { value: REAL_PLATFORM, configurable: true })
        await rm(root, { recursive: true, force: true })
    })

    it('runs a .exe directly', async () => {
        const dir = await writeFixtureExtension(root, 'compiled')
        const exe = join(dir, 'td-compiled.exe')
        await writeFile(exe, 'MZ fake binary')
        await chmod(exe, 0o755)
        asWindows()

        const plan = await buildSpawnPlan(exe, ['a'])

        expect(plan.command).toBe(exe)
        expect(plan.args).toEqual(['a'])
    })

    it('runs a .cmd through the command interpreter, which is the only way it can run', async () => {
        const dir = await writeFixtureExtension(root, 'batch')
        const cmd = join(dir, 'td-batch.cmd')
        await writeFile(cmd, '@echo off\r\n')
        await chmod(cmd, 0o755)
        asWindows()

        const plan = await buildSpawnPlan(cmd, ['a', 'b'])

        expect(plan.command).toMatch(/cmd\.exe$/i)
        expect(plan.args).toEqual(['/d', '/s', '/c', `"${cmd}" "a" "b"`])
        // The line is written for cmd.exe, so node must not quote it again.
        expect(plan.verbatim).toBe(true)
    })

    it('quotes a batch argument that cmd.exe would otherwise read as a command', async () => {
        const dir = await writeFixtureExtension(root, 'batch')
        const cmd = join(dir, 'td-batch.cmd')
        await writeFile(cmd, '@echo off\r\n')
        await chmod(cmd, 0o755)
        asWindows()

        // Node quotes an argument only when it contains a space, so `&whoami`
        // would reach cmd.exe bare and the `&` would start a second command.
        const plan = await buildSpawnPlan(cmd, ['&whoami', 'a b'])

        expect(plan.args[3]).toBe(`"${cmd}" "&whoami" "a b"`)
    })

    it('doubles an embedded quote so it cannot end the quoting', async () => {
        const dir = await writeFixtureExtension(root, 'batch')
        const cmd = join(dir, 'td-batch.cmd')
        await writeFile(cmd, '@echo off\r\n')
        await chmod(cmd, 0o755)
        asWindows()

        const plan = await buildSpawnPlan(cmd, ['say "hi"'])

        expect(plan.args[3]).toBe(`"${cmd}" "say ""hi"""`)
    })

    it('refuses a batch argument that quoting cannot contain', async () => {
        const dir = await writeFixtureExtension(root, 'batch')
        const cmd = join(dir, 'td-batch.cmd')
        await writeFile(cmd, '@echo off\r\n')
        await chmod(cmd, 0o755)
        asWindows()

        // cmd.exe expands these from inside quotes, so there is no escaping
        // that holds; refusing is the only honest answer.
        for (const argument of ['%PATH%', 'a!b', 'one\ntwo']) {
            await expect(buildSpawnPlan(cmd, [argument])).rejects.toMatchObject({
                code: 'EXTENSION_NOT_EXECUTABLE',
            })
        }
    })

    it('leaves the other Windows paths taking arguments unchanged', async () => {
        const dir = await writeFixtureExtension(root, 'compiled')
        const exe = join(dir, 'td-compiled.exe')
        await writeFile(exe, 'MZ fake binary')
        await chmod(exe, 0o755)
        asWindows()

        // Only the batch path goes through cmd.exe, so only it needs quoting.
        const plan = await buildSpawnPlan(exe, ['&whoami', '%PATH%'])

        expect(plan.args).toEqual(['&whoami', '%PATH%'])
        expect(plan.verbatim).toBeUndefined()
    })

    it('runs a shell script through sh, keeping arguments as positional parameters', async () => {
        const dir = await writeFixtureExtension(root, 'shell', { interpreter: 'sh' })
        const script = join(dir, 'td-shell')
        asWindows()

        const plan = await buildSpawnPlan(script, ['a b', '--flag'])

        expect(plan.command).toBe('sh')
        expect(plan.args).toEqual(['-c', '"$0" "$@"', script, 'a b', '--flag'])
    })

    it('still prefers the host node for a node script', async () => {
        const dir = await writeFixtureExtension(root, 'goals')
        asWindows()

        const plan = await buildSpawnPlan(join(dir, 'td-goals'), [])

        expect(plan.command).toBe(process.execPath)
    })
})

describe.skipIf(process.platform === 'win32')('node shebang options', () => {
    let root: string

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'td-ext-shebang-'))
    })

    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })

    async function planFor(shebang: string): Promise<Awaited<ReturnType<typeof buildSpawnPlan>>> {
        const dir = join(root, 'td-x')
        await mkdir(dir, { recursive: true })
        const path = join(dir, 'td-x')
        await writeFile(path, `${shebang}\nconsole.log('hi')\n`)
        await chmod(path, 0o755)
        return buildSpawnPlan(path, ['run'])
    }

    it('keeps options the script asked its interpreter for', async () => {
        const plan = await planFor('#!/usr/bin/env -S node --conditions=development')

        expect(plan.command).toBe(process.execPath)
        expect(plan.args[0]).toBe('--conditions=development')
        expect(plan.args.at(-1)).toBe('run')
    })

    it.each(['#!/usr/bin/env node', '#!/usr/bin/node', '#!/usr/local/bin/node'])(
        'recognises %s',
        async (shebang) => {
            const plan = await planFor(shebang)
            expect(plan.command).toBe(process.execPath)
        },
    )

    it('leaves a non-node interpreter to the operating system', async () => {
        const plan = await planFor('#!/bin/sh')

        expect(plan.command).not.toBe(process.execPath)
    })
})
