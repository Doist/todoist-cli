import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { writeFixtureExtension } from '../../test-support/extension-fixture.js'
import { discoverExtensions } from './discover.js'
import { headSha } from './git.js'
import { createGitHubClient } from './github.js'
import type { InstallContext } from './install.js'
import { installDependencies } from './npm.js'
import { run } from './run.js'
import { readState, writeState } from './state.js'
import { upgradeExtension } from './upgrade.js'

// Dependency installation is a real npm run; the upgrade tests only care that
// it is triggered by the right change, so stand in for it here.
vi.mock('./npm.js', () => ({
    installDependencies: vi.fn(async () => undefined),
    hasPackageJson: vi.fn(async () => true),
}))

const HAS_GIT = (await run('git', ['--version'])).code === 0

const OFFICIAL = { host: 'github.com', owner: 'Doist' }
const PLATFORM_SUFFIX = `${process.platform}-${process.arch}`
const BINARY = Buffer.from('#!/bin/sh\necho new\n')

function manifestFor(tag: string) {
    return {
        owner: 'Doist',
        name: 'td-goals',
        host: 'github.com',
        tag,
        pinned: false,
        asset: `td-goals_${tag}_${PLATFORM_SUFFIX}`,
        installedAt: '2026-09-01T00:00:00Z',
    }
}

function stubGitHub(latestTag: string) {
    return vi.fn(async (input: string | URL | Request) => {
        const url = String(input)
        if (url.includes('/releases/latest')) {
            return new Response(
                JSON.stringify({
                    tag_name: latestTag,
                    assets: [
                        {
                            name: `td-goals_${latestTag}_${PLATFORM_SUFFIX}`,
                            url: 'https://api.github.com/assets/bin',
                            size: BINARY.length,
                        },
                    ],
                }),
                { status: 200 },
            )
        }
        if (url.endsWith('/assets/bin'))
            return new Response(new Uint8Array(BINARY), { status: 200 })
        return new Response('', { status: 404 })
    }) as unknown as typeof fetch
}

describe('upgradeExtension', () => {
    let root: string
    let extensionsDir: string
    let stateDir: string

    function contextFor(fetchImpl: typeof fetch): InstallContext {
        return {
            binName: 'td',
            extensionsDir,
            stateDir,
            officialSource: OFFICIAL,
            client: createGitHubClient(fetchImpl),
            reservedNames: () => [],
            log: () => undefined,
            warn: () => undefined,
            trustWarning: 'trust warning',
        }
    }

    const find = async (name: string) => {
        const found = await discoverExtensions({
            extensionsDir,
            stateDir,
            binName: 'td',
            officialSource: OFFICIAL,
        })
        const extension = found.find((candidate) => candidate.name === name)
        if (!extension) throw new Error(`fixture ${name} not discovered`)
        return extension
    }

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'td-ext-upgrade-'))
        extensionsDir = join(root, 'extensions')
        stateDir = join(root, 'state')
        await mkdir(extensionsDir, { recursive: true })
    })

    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })

    it('leaves a local install alone', async () => {
        const workspace = join(root, 'code')
        await mkdir(workspace, { recursive: true })
        const target = await writeFixtureExtension(workspace, 'scratch')
        // Matching installLocal, which writes a path file on Windows because
        // symlinks there need rights the test runner will not have.
        if (process.platform === 'win32') {
            await writeFile(join(extensionsDir, 'td-scratch'), target, 'utf8')
        } else {
            await symlink(target, join(extensionsDir, 'td-scratch'), 'dir')
        }

        const result = await upgradeExtension(
            await find('scratch'),
            {},
            contextFor(stubGitHub('v2')),
        )

        expect(result).toMatchObject({ outcome: 'skipped' })
        expect(result.detail).toMatch(/local installs/)
    })

    it('skips a pinned extension and says what it is pinned to', async () => {
        await writeFixtureExtension(extensionsDir, 'goals', {
            installedManifest: manifestFor('v1.0.0'),
        })
        await writeState(stateDir, 'td-goals', { pinned: 'v1.0.0' })

        const result = await upgradeExtension(
            await find('goals'),
            {},
            contextFor(stubGitHub('v2.0.0')),
        )

        expect(result).toMatchObject({ outcome: 'skipped', detail: 'pinned to v1.0.0' })
    })

    it('upgrades past a pin only when forced, and clears the pin it moved off', async () => {
        await writeFixtureExtension(extensionsDir, 'goals', {
            installedManifest: manifestFor('v1.0.0'),
        })
        await writeState(stateDir, 'td-goals', { pinned: 'v1.0.0' })

        const result = await upgradeExtension(
            await find('goals'),
            { force: true },
            contextFor(stubGitHub('v2.0.0')),
        )

        expect(result).toMatchObject({ outcome: 'upgraded', from: 'v1.0.0', to: 'v2.0.0' })

        // A pin left behind would make every later upgrade skip this
        // extension, forever.
        await expect(readState(stateDir, 'td-goals')).resolves.not.toHaveProperty('pinned')
        const next = await upgradeExtension(
            await find('goals'),
            {},
            contextFor(stubGitHub('v3.0.0')),
        )
        expect(next.outcome).not.toBe('skipped')
    })

    it('reports an up-to-date binary without downloading anything', async () => {
        await writeFixtureExtension(extensionsDir, 'goals', {
            installedManifest: manifestFor('v1.0.0'),
        })
        const fetchImpl = stubGitHub('v1.0.0')

        const result = await upgradeExtension(await find('goals'), {}, contextFor(fetchImpl))

        expect(result).toMatchObject({ outcome: 'up-to-date' })
        expect(
            vi.mocked(fetchImpl).mock.calls.some(([url]) => String(url).includes('assets')),
        ).toBe(false)
    })

    it('reports what a dry run would do without touching the install', async () => {
        await writeFixtureExtension(extensionsDir, 'goals', {
            installedManifest: manifestFor('v1.0.0'),
        })

        const result = await upgradeExtension(
            await find('goals'),
            { dryRun: true },
            contextFor(stubGitHub('v2.0.0')),
        )

        expect(result).toMatchObject({ outcome: 'would-upgrade', from: 'v1.0.0', to: 'v2.0.0' })
        const manifest = JSON.parse(
            await readFile(join(extensionsDir, 'td-goals', '.td-manifest.json'), 'utf8'),
        )
        expect(manifest.tag).toBe('v1.0.0')
    })

    it('downloads and replaces a binary when the tag has moved', async () => {
        await writeFixtureExtension(extensionsDir, 'goals', {
            installedManifest: manifestFor('v1.0.0'),
        })

        const result = await upgradeExtension(
            await find('goals'),
            {},
            contextFor(stubGitHub('v2.0.0')),
        )

        expect(result).toMatchObject({ outcome: 'upgraded', from: 'v1.0.0', to: 'v2.0.0' })
        const executable = await readFile(join(extensionsDir, 'td-goals', 'td-goals'))
        expect(executable.equals(BINARY)).toBe(true)
        const manifest = JSON.parse(
            await readFile(join(extensionsDir, 'td-goals', '.td-manifest.json'), 'utf8'),
        )
        expect(manifest.tag).toBe('v2.0.0')
    })

    it('skips a binary install that has no manifest to compare against', async () => {
        await writeFixtureExtension(extensionsDir, 'orphan')

        const result = await upgradeExtension(
            await find('orphan'),
            {},
            contextFor(stubGitHub('v2.0.0')),
        )

        expect(result).toMatchObject({ outcome: 'skipped' })
        expect(result.detail).toMatch(/no manifest/)
    })
})

describe.skipIf(!HAS_GIT)('upgradeExtension for git clones', () => {
    let root: string
    let extensionsDir: string
    let stateDir: string
    let origin: string

    function contextFor(): InstallContext {
        return {
            binName: 'td',
            extensionsDir,
            stateDir,
            officialSource: OFFICIAL,
            client: createGitHubClient(stubGitHub('v1')),
            reservedNames: () => [],
            log: () => undefined,
            warn: (message) => warnings.push(message),
            trustWarning: 'trust warning',
        }
    }

    let warnings: string[]

    const commit = async (dir: string, message: string) => {
        await run('git', ['add', '.'], { cwd: dir })
        await run(
            'git',
            [
                '-c',
                'user.email=t@example.com',
                '-c',
                'user.name=T',
                'commit',
                '--quiet',
                '-m',
                message,
            ],
            { cwd: dir },
        )
    }

    const find = async (name: string) => {
        const found = await discoverExtensions({
            extensionsDir,
            stateDir,
            binName: 'td',
            officialSource: OFFICIAL,
        })
        const extension = found.find((candidate) => candidate.name === name)
        if (!extension) throw new Error(`fixture ${name} not discovered`)
        return extension
    }

    beforeEach(async () => {
        warnings = []
        root = await mkdtemp(join(tmpdir(), 'td-ext-upgrade-git-'))
        extensionsDir = join(root, 'extensions')
        stateDir = join(root, 'state')
        await mkdir(extensionsDir, { recursive: true })

        origin = join(root, 'origin', 'td-cloned')
        await mkdir(origin, { recursive: true })
        await writeFile(join(origin, 'td-cloned'), '#!/bin/sh\necho v1\n', { mode: 0o755 })
        await run('git', ['init', '--quiet', '--initial-branch=main'], { cwd: origin })
        await commit(origin, 'first')

        await run('git', ['clone', '--quiet', `file://${origin}`, join(extensionsDir, 'td-cloned')])
    })

    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })

    async function advanceOrigin(files: Record<string, string> = {}): Promise<void> {
        await writeFile(join(origin, 'td-cloned'), '#!/bin/sh\necho v2\n', { mode: 0o755 })
        for (const [name, contents] of Object.entries(files)) {
            await writeFile(join(origin, name), contents)
        }
        await commit(origin, 'second')
    }

    it('reports up-to-date when the remote has not moved', async () => {
        const result = await upgradeExtension(await find('cloned'), {}, contextFor())

        expect(result).toMatchObject({ outcome: 'up-to-date' })
    })

    it('fast-forwards when the remote has new commits', async () => {
        await advanceOrigin()

        const result = await upgradeExtension(await find('cloned'), {}, contextFor())

        expect(result.outcome).toBe('upgraded')
        expect(result.from).not.toBe(result.to)
        const executable = await readFile(join(extensionsDir, 'td-cloned', 'td-cloned'), 'utf8')
        expect(executable).toContain('echo v2')
    })

    it('prints the trust warning before it runs any of the new code', async () => {
        await advanceOrigin({ 'package.json': JSON.stringify({ name: 'td-cloned' }) })
        const order: string[] = []
        const context = contextFor()
        context.warn = (message) => {
            order.push(`warn:${message}`)
            warnings.push(message)
        }
        vi.mocked(installDependencies).mockImplementation(async () => {
            order.push('install-dependencies')
        })

        await upgradeExtension(await find('cloned'), {}, context)

        // Dependency installation runs the repository's own lifecycle scripts,
        // so the warning has to come first, not merely be present.
        expect(order).toEqual(['warn:trust warning', 'install-dependencies'])
    })

    it('reports what a dry run would do without moving the clone', async () => {
        await advanceOrigin()
        const before = await headSha(join(extensionsDir, 'td-cloned'))

        const result = await upgradeExtension(await find('cloned'), { dryRun: true }, contextFor())

        expect(result.outcome).toBe('would-upgrade')
        await expect(headSha(join(extensionsDir, 'td-cloned'))).resolves.toBe(before)
        expect(warnings).toEqual([])
    })

    it('reinstalls dependencies when package.json changed', async () => {
        await advanceOrigin({ 'package.json': JSON.stringify({ name: 'td-cloned' }) })

        await upgradeExtension(await find('cloned'), {}, contextFor())

        expect(vi.mocked(installDependencies)).toHaveBeenCalledWith(
            join(extensionsDir, 'td-cloned'),
        )
    })

    it('leaves dependencies alone when nothing about them changed', async () => {
        await advanceOrigin()

        await upgradeExtension(await find('cloned'), {}, contextFor())

        expect(vi.mocked(installDependencies)).not.toHaveBeenCalled()
    })

    it('clears the pin when a forced upgrade moves the clone off it', async () => {
        await advanceOrigin()
        await writeState(stateDir, 'td-cloned', { pinned: 'abc1234' })

        const skipped = await upgradeExtension(await find('cloned'), {}, contextFor())
        expect(skipped).toMatchObject({ outcome: 'skipped', detail: 'pinned to abc1234' })

        await upgradeExtension(await find('cloned'), { force: true }, contextFor())

        await expect(readState(stateDir, 'td-cloned')).resolves.not.toHaveProperty('pinned')
        const afterClearing = await upgradeExtension(await find('cloned'), {}, contextFor())
        expect(afterClearing.outcome).not.toBe('skipped')
    })
})

describe.skipIf(!HAS_GIT)('upgradeExtension failure handling', () => {
    let root: string
    let extensionsDir: string
    let stateDir: string
    let origin: string
    let warnings: string[]

    function contextFor(): InstallContext {
        return {
            binName: 'td',
            extensionsDir,
            stateDir,
            officialSource: OFFICIAL,
            client: createGitHubClient(stubGitHub('v1')),
            reservedNames: () => [],
            log: () => undefined,
            warn: (message) => warnings.push(message),
            trustWarning: 'trust warning',
        }
    }

    const commit = async (dir: string, message: string) => {
        await run('git', ['add', '.'], { cwd: dir })
        await run(
            'git',
            [
                '-c',
                'user.email=t@example.com',
                '-c',
                'user.name=T',
                'commit',
                '--quiet',
                '-m',
                message,
            ],
            { cwd: dir },
        )
    }

    const find = async (name: string) => {
        const found = await discoverExtensions({
            extensionsDir,
            stateDir,
            binName: 'td',
            officialSource: OFFICIAL,
        })
        const extension = found.find((candidate) => candidate.name === name)
        if (!extension) throw new Error(`fixture ${name} not discovered`)
        return extension
    }

    beforeEach(async () => {
        warnings = []
        root = await mkdtemp(join(tmpdir(), 'td-ext-upgrade-fail-'))
        extensionsDir = join(root, 'extensions')
        stateDir = join(root, 'state')
        await mkdir(extensionsDir, { recursive: true })

        origin = join(root, 'origin', 'td-cloned')
        await mkdir(origin, { recursive: true })
        await writeFile(join(origin, 'td-cloned'), '#!/bin/sh\necho v1\n', { mode: 0o755 })
        await run('git', ['init', '--quiet', '--initial-branch=main'], { cwd: origin })
        await commit(origin, 'first')
        await run('git', ['clone', '--quiet', `file://${origin}`, join(extensionsDir, 'td-cloned')])
    })

    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })

    it('puts the clone back when installing dependencies fails', async () => {
        const before = await headSha(join(extensionsDir, 'td-cloned'))
        await writeFile(join(origin, 'package.json'), JSON.stringify({ name: 'td-cloned' }))
        await commit(origin, 'add dependencies')
        vi.mocked(installDependencies).mockRejectedValueOnce(new Error('npm exploded'))

        await expect(upgradeExtension(await find('cloned'), {}, contextFor())).rejects.toThrow(
            'npm exploded',
        )

        // Left at the new commit, the next upgrade would see nothing to do and
        // never retry the dependencies its code now needs.
        await expect(headSha(join(extensionsDir, 'td-cloned'))).resolves.toBe(before)
    })

    it('reports that it could not check, rather than claiming up to date', async () => {
        await run('git', ['remote', 'set-url', 'origin', 'file:///nonexistent/repo.git'], {
            cwd: join(extensionsDir, 'td-cloned'),
        })

        const result = await upgradeExtension(await find('cloned'), { dryRun: true }, contextFor())

        expect(result.outcome).toBe('skipped')
        expect(result.detail).toMatch(/could not reach the remote/)
    })
})
