import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { captureConsole, createTestProgram } from '@doist/cli-core/testing'
import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listTemplates } from '../../lib/extensions/create.js'
import { writeFixtureExtension } from '../../test-support/extension-fixture.js'
import { buildExtensionManager, registerExtensionCommand, templatesDir } from './index.js'

describe('buildExtensionManager', () => {
    let root: string

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'td-ext-host-'))
        vi.stubEnv('XDG_DATA_HOME', join(root, 'data'))
        vi.stubEnv('XDG_STATE_HOME', join(root, 'state'))
        captureConsole('log')
    })

    afterEach(async () => {
        vi.unstubAllEnvs()
        await rm(root, { recursive: true, force: true })
    })

    it('puts extensions under the data directory', () => {
        const manager = buildExtensionManager(new Command())
        expect(manager.extensionsDir).toBe(join(root, 'data', 'todoist-cli', 'extensions'))
    })

    it('is configured for this CLI', () => {
        const manager = buildExtensionManager(new Command())
        expect(manager.binName).toBe('td')
        expect(manager.envPrefix).toBe('TD')
        expect(manager.officialLabel).toBe('Todoist')
        expect(manager.trustWarning).toContain('endorsed by Todoist')
    })

    it('treats every registered command name and alias as taken', async () => {
        const program = new Command()
        program.command('task')
        program.command('accounts').alias('users')

        await mkdir(join(root, 'data', 'todoist-cli', 'extensions'), { recursive: true })
        const extensionsDir = join(root, 'data', 'todoist-cli', 'extensions')
        await writeFixtureExtension(extensionsDir, 'task', {})
        await writeFixtureExtension(extensionsDir, 'users', {})
        await writeFixtureExtension(extensionsDir, 'goals', {})

        const listing = await buildExtensionManager(program).list()
        const shadowed = listing.filter((entry) => entry.shadowed).map((entry) => entry.name)
        expect(shadowed.sort()).toEqual(['task', 'users'])
    })

    it('is built before any extension is registered, so none shadows itself', async () => {
        const program = new Command()
        await mkdir(join(root, 'data', 'todoist-cli', 'extensions'), { recursive: true })
        await writeFixtureExtension(join(root, 'data', 'todoist-cli', 'extensions'), 'goals', {})

        const manager = buildExtensionManager(program)
        // Something else registers `goals` afterwards; the snapshot is already
        // taken, so the extension is still reported as usable.
        program.command('goals')

        const [entry] = await manager.list()
        expect(entry.shadowed).toBe(false)
    })
})

describe('templatesDir', () => {
    it('resolves to the templates the package actually ships', async () => {
        // The path is relative to this module's own location, so moving the
        // command file would break `extension create` at runtime while every
        // test that recomputes the URL itself still passed.
        await expect(listTemplates(templatesDir())).resolves.toEqual(['bash', 'node'])
    })
})

describe('registerExtensionCommand', () => {
    beforeEach(() => {
        captureConsole('log')
    })

    it('registers the group under both names', () => {
        const program = createTestProgram(registerExtensionCommand)
        const group = program.commands.find((command) => command.name() === 'extension')
        expect(group).toBeDefined()
        expect(group?.aliases()).toContain('ext')
        expect(group?.commands.map((command) => command.name()).sort()).toEqual([
            'create',
            'exec',
            'install',
            'list',
            'remove',
            'upgrade',
        ])
    })
})
