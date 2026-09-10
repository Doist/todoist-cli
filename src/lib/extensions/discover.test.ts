import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeFakeGitRepo, writeFixtureExtension } from '../../test-support/extension-fixture.js'
import { discoverExtensions, parseRemote } from './discover.js'
import { writeState } from './state.js'

const OFFICIAL = { host: 'github.com', owner: 'Doist' }

describe('parseRemote', () => {
    it.each([
        ['https://github.com/Doist/td-goals.git', 'github.com', 'Doist', 'td-goals'],
        ['https://git.example.com/Doist/td-goals', 'git.example.com', 'Doist', 'td-goals'],
        ['git@github.com:example/td-standup.git', 'github.com', 'example', 'td-standup'],
    ])('parses %s', (url, host, owner, repo) => {
        expect(parseRemote(url)).toEqual({ host, owner, repo })
    })

    it('returns undefined for something that is not a remote', () => {
        expect(parseRemote('not-a-remote')).toBeUndefined()
    })
})

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

    it('follows a local install to its target and never marks it official', async () => {
        const workspace = join(root, 'code')
        await mkdir(workspace, { recursive: true })
        const target = await writeFixtureExtension(workspace, 'scratch')
        await writeFakeGitRepo(target, 'https://github.com/Doist/td-scratch.git')
        await symlink(target, join(extensionsDir, 'td-scratch'), 'dir')

        const [extension] = await discover()
        expect(extension).toMatchObject({ name: 'scratch', kind: 'local', official: false })
        expect(extension.dir).toBe(target)
        expect(extension.executablePath).toBe(join(target, 'td-scratch'))
    })

    it('follows a Windows-style path file for a local install', async () => {
        const workspace = join(root, 'code')
        await mkdir(workspace, { recursive: true })
        const target = await writeFixtureExtension(workspace, 'scratch')
        await writeFile(join(extensionsDir, 'td-scratch'), target, 'utf8')

        const [extension] = await discover()
        expect(extension).toMatchObject({ kind: 'local', dir: target })
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

    it('sorts by command name', async () => {
        await writeFixtureExtension(extensionsDir, 'zulu')
        await writeFixtureExtension(extensionsDir, 'alpha')

        const found = await discover()
        expect(found.map((extension) => extension.name)).toEqual(['alpha', 'zulu'])
    })
})
