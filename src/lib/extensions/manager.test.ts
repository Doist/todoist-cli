import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeFixtureExtension } from '../../test-support/extension-fixture.js'
import { createExtensionManager, type ExtensionManager } from './manager.js'

describe('createExtensionManager', () => {
    let root: string
    let dataDir: string
    let extensionsDir: string
    let warnings: string[]

    function makeManager(reserved: string[] = []): ExtensionManager {
        return createExtensionManager({
            binName: 'td',
            envPrefix: 'TD',
            version: '5.3.1',
            dataDir,
            stateDir: join(root, 'state'),
            configDir: join(root, 'config'),
            hostPath: '/host/dist/index.js',
            reservedNames: () => reserved,
            officialSource: { host: 'github.com', owner: 'Doist' },
            officialLabel: 'Todoist',
            warn: (message) => warnings.push(message),
            log: () => undefined,
        })
    }

    /** Send the fixture's report to a file so it does not print during tests. */
    const quiet = () => ({ XX_REPORT: join(root, 'report.json') })

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'td-ext-manager-'))
        dataDir = join(root, 'todoist-cli')
        extensionsDir = join(dataDir, 'extensions')
        warnings = []
        await mkdir(extensionsDir, { recursive: true })
    })

    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })

    it('puts extensions under <dataDir>/extensions', () => {
        expect(makeManager().extensionsDir).toBe(extensionsDir)
    })

    it('reports an empty install, and stops reporting one once something is installed', async () => {
        const manager = makeManager()
        await expect(manager.isEmpty()).resolves.toBe(true)

        await writeFixtureExtension(extensionsDir, 'goals')
        await expect(manager.isEmpty()).resolves.toBe(false)
    })

    it('builds a trust warning that names the CLI’s owner', () => {
        expect(makeManager().trustWarning).toContain('endorsed by Todoist')
    })

    it('resolves a loose selector to an installed extension', async () => {
        await writeFixtureExtension(extensionsDir, 'goals')
        const manager = makeManager()

        for (const selector of ['goals', 'td-goals', 'Doist/td-goals']) {
            await expect(manager.find(selector)).resolves.toMatchObject({ name: 'goals' })
        }
    })

    it('throws a not-found error that points at the list command', async () => {
        await expect(makeManager().require('ghost')).rejects.toMatchObject({
            code: 'EXTENSION_NOT_FOUND',
            hints: [expect.stringContaining('extension list')],
        })
    })

    it('reports an unknown selector the same way when upgrading', async () => {
        await expect(makeManager().upgrade(['ghost'])).rejects.toMatchObject({
            code: 'EXTENSION_NOT_FOUND',
            hints: [expect.stringContaining('extension list')],
        })
    })

    it('upgrades an extension once however many names it was given by', async () => {
        await writeFixtureExtension(extensionsDir, 'goals')

        const results = await makeManager().upgrade(['goals', 'td-goals', 'Doist/td-goals'])

        // Two upgrades of one directory at once would write over each other.
        expect(results).toHaveLength(1)
        expect(results[0].name).toBe('goals')
    })

    it('flags an extension whose name a built-in command owns', async () => {
        await writeFixtureExtension(extensionsDir, 'task')
        await writeFixtureExtension(extensionsDir, 'goals')

        const listing = await makeManager(['task']).list()

        expect(listing.find((entry) => entry.name === 'task')?.shadowed).toBe(true)
        expect(listing.find((entry) => entry.name === 'goals')?.shadowed).toBe(false)
    })

    it('reports an executable that has not been built', async () => {
        await writeFixtureExtension(extensionsDir, 'built')
        await writeFixtureExtension(extensionsDir, 'unbuilt', { notExecutable: true })

        const listing = await makeManager().list()

        expect(listing.find((entry) => entry.name === 'built')?.executable).toBe(true)
        expect(listing.find((entry) => entry.name === 'unbuilt')?.executable).toBe(false)
    })

    it('reports the release tag as the version of a binary install', async () => {
        await writeFixtureExtension(extensionsDir, 'goals', {
            installedManifest: {
                owner: 'Doist',
                name: 'td-goals',
                host: 'github.com',
                tag: 'v0.3.0',
                pinned: false,
                asset: 'a',
                installedAt: 'now',
            },
        })

        const [entry] = await makeManager().list()
        expect(entry).toMatchObject({ version: 'v0.3.0', official: true })
    })

    it('has no version for a local install', async () => {
        const workspace = join(root, 'code')
        await mkdir(workspace, { recursive: true })
        const target = await writeFixtureExtension(workspace, 'scratch')
        await symlink(target, join(extensionsDir, 'td-scratch'), 'dir')

        const [entry] = await makeManager().list()
        expect(entry.version).toBeUndefined()
    })

    it('runs an extension and returns its exit code', async () => {
        await writeFixtureExtension(extensionsDir, 'goals')

        await expect(
            makeManager().dispatch('goals', ['--exit-code', '7'], { env: quiet() }),
        ).resolves.toBe(7)
    })

    it('warns, but still runs, when the host is older than the extension requires', async () => {
        await writeFixtureExtension(extensionsDir, 'goals', {
            authoredManifest: { requires: { td: '>=9.0.0' } },
        })

        await expect(makeManager().dispatch('goals', [], { env: quiet() })).resolves.toBe(0)
        expect(warnings.some((warning) => warning.includes('expects td >=9.0.0'))).toBe(true)
    })

    it('says nothing when the host satisfies the required range', async () => {
        await writeFixtureExtension(extensionsDir, 'goals', {
            authoredManifest: { requires: { td: '>=5.0.0' } },
        })

        await makeManager().dispatch('goals', [], { env: quiet() })
        expect(warnings).toEqual([])
    })
})
