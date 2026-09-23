import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeFakeGitRepo, writeFixtureExtension } from '../../test-support/extension-fixture.js'
import { discoverExtensions, findExtension } from './discover.js'
import { writeState } from './state.js'

const OFFICIAL = { host: 'github.com', owner: 'Doist' }

describe('discoverExtensions', () => {
    let root: string
    let extensionsDir: string
    let stateDir: string

    const discover = () =>
        discoverExtensions({ extensionsDir, stateDir, binName: 'td', officialSource: OFFICIAL })

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'td-ext-discover-'))
        extensionsDir = join(root, 'extensions')
        stateDir = join(root, 'state')
        await mkdir(extensionsDir, { recursive: true })
    })

    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })

    it('returns nothing when the extensions directory does not exist', async () => {
        const missing = discoverExtensions({
            extensionsDir: join(root, 'nope'),
            stateDir,
            binName: 'td',
            officialSource: OFFICIAL,
        })
        await expect(missing).resolves.toEqual([])
    })

    it('ignores directories that do not carry the binary-name prefix', async () => {
        await mkdir(join(extensionsDir, 'unrelated'), { recursive: true })
        await mkdir(join(extensionsDir, 'td-'), { recursive: true })
        await writeFixtureExtension(extensionsDir, 'goals')

        const found = await discover()
        expect(found.map((extension) => extension.name)).toEqual(['goals'])
    })

    it('reads a binary install from its manifest and marks a first-party source', async () => {
        await writeFixtureExtension(extensionsDir, 'goals', {
            installedManifest: {
                owner: 'Doist',
                name: 'td-goals',
                host: 'github.com',
                tag: 'v0.3.0',
                pinned: false,
                asset: 'td-goals_v0.3.0_linux-x64',
                installedAt: '2026-09-07T10:12:00Z',
                description: 'Track quarterly goals',
            },
        })

        const [extension] = await discover()
        expect(extension).toMatchObject({
            name: 'goals',
            dirName: 'td-goals',
            kind: 'binary',
            source: 'Doist/td-goals',
            official: true,
            description: 'Track quarterly goals',
        })
    })

    it('reads a git install from its remote, and withholds the marker from another host', async () => {
        const dir = await writeFixtureExtension(extensionsDir, 'x')
        await writeFakeGitRepo(dir, 'https://git.example.com/Doist/td-x')

        const [extension] = await discover()
        expect(extension).toMatchObject({
            kind: 'git',
            host: 'git.example.com',
            owner: 'Doist',
            source: 'Doist/td-x',
            official: false,
        })
    })

    it('marks a git install from the official host and owner', async () => {
        const dir = await writeFixtureExtension(extensionsDir, 'x')
        await writeFakeGitRepo(dir, 'https://github.com/Doist/td-x.git')

        const [extension] = await discover()
        expect(extension.official).toBe(true)
    })

    it.skipIf(process.platform === 'win32')(
        'follows a local install to its target and never marks it official',
        async () => {
            const workspace = join(root, 'code')
            await mkdir(workspace, { recursive: true })
            const target = await writeFixtureExtension(workspace, 'scratch')
            await writeFakeGitRepo(target, 'https://github.com/Doist/td-scratch.git')
            await symlink(target, join(extensionsDir, 'td-scratch'), 'dir')

            const [extension] = await discover()
            expect(extension).toMatchObject({ name: 'scratch', kind: 'local', official: false })
            expect(extension.dir).toBe(target)
            expect(extension.executablePath).toBe(join(target, 'td-scratch'))
        },
    )

    it('follows a Windows-style path file for a local install', async () => {
        const workspace = join(root, 'code')
        await mkdir(workspace, { recursive: true })
        const target = await writeFixtureExtension(workspace, 'scratch')
        await writeFile(join(extensionsDir, 'td-scratch'), target, 'utf8')

        const [extension] = await discover()
        expect(extension).toMatchObject({ kind: 'local', dir: target })
    })

    it('resolves a relative path file against its own directory, not the cwd', async () => {
        const target = await writeFixtureExtension(extensionsDir, 'sibling')
        await writeFile(join(extensionsDir, 'td-scratch'), 'td-sibling', 'utf8')

        const found = await discover()
        const scratch = found.find((extension) => extension.name === 'scratch')
        expect(scratch?.dir).toBe(target)
    })

    it('treats a plain file named .git as part of a binary install', async () => {
        await writeFixtureExtension(extensionsDir, 'goals', {
            files: { '.git': 'gitdir: elsewhere' },
            installedManifest: {
                owner: 'Doist',
                name: 'td-goals',
                host: 'github.com',
                tag: 'v1',
                pinned: false,
                asset: 'a',
                installedAt: 'now',
            },
        })

        const [extension] = await discover()
        expect(extension.kind).toBe('binary')
        expect(extension.source).toBe('Doist/td-goals')
    })

    it('reports a failure to read the extensions directory rather than hiding it', async () => {
        await writeFile(join(root, 'not-a-directory'), 'x')

        await expect(
            discoverExtensions({
                extensionsDir: join(root, 'not-a-directory'),
                stateDir,
                binName: 'td',
                officialSource: OFFICIAL,
            }),
        ).rejects.toThrow()
    })

    it('records what a pinned extension is pinned to', async () => {
        await writeFixtureExtension(extensionsDir, 'goals')
        await writeState(stateDir, 'td-goals', { pinned: 'v1.2.3' })

        const [extension] = await discover()
        expect(extension.pinnedRef).toBe('v1.2.3')
    })

    it('prefers the authored manifest over the one written at install time', async () => {
        await writeFixtureExtension(extensionsDir, 'goals', {
            authoredManifest: { description: 'from the author', requires: { td: '>=9.0.0' } },
            installedManifest: {
                owner: 'Doist',
                name: 'td-goals',
                host: 'github.com',
                tag: 'v1',
                pinned: false,
                asset: 'a',
                installedAt: 'now',
                description: 'from install time',
            },
        })

        const [extension] = await discover()
        expect(extension.description).toBe('from the author')
        expect(extension.requires).toEqual({ td: '>=9.0.0' })
    })

    it('reports a pin recorded in the state directory', async () => {
        await writeFixtureExtension(extensionsDir, 'goals')
        await writeState(stateDir, 'td-goals', { pinned: 'v1.2.3' })

        const [extension] = await discover()
        expect(extension.pinned).toBe(true)
    })

    describe('findExtension', () => {
        const find = (name: string) =>
            findExtension(name, {
                extensionsDir,
                stateDir,
                binName: 'td',
                officialSource: OFFICIAL,
            })

        it('describes only the extension asked for', async () => {
            await writeFixtureExtension(extensionsDir, 'goals')
            await writeFixtureExtension(extensionsDir, 'standup')

            await expect(find('goals')).resolves.toMatchObject({ name: 'goals' })
        })

        it('returns nothing when that extension is not installed', async () => {
            await writeFixtureExtension(extensionsDir, 'goals')

            await expect(find('missing')).resolves.toBeUndefined()
        })
    })

    it('sorts by command name', async () => {
        await writeFixtureExtension(extensionsDir, 'zulu')
        await writeFixtureExtension(extensionsDir, 'alpha')

        const found = await discover()
        expect(found.map((extension) => extension.name)).toEqual(['alpha', 'zulu'])
    })
})
