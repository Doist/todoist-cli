import { createHash } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { writeFixtureExtension } from '../../test-support/extension-fixture.js'
import { createGitHubClient } from './github.js'
import { installExtension, type InstallContext } from './install.js'
import { run } from './run.js'
import { readState } from './state.js'

const PLATFORM_SUFFIX = `${process.platform}-${process.arch}`
const ASSET_NAME = `td-goals_v1.0.0_${PLATFORM_SUFFIX}`
const BINARY = Buffer.from('#!/bin/sh\necho goals\n')
const CHECKSUM = createHash('sha256').update(BINARY).digest('hex')

type StubOptions = {
    tag?: string
    assetName?: string
    binary?: Buffer
    checksums?: string | null
    authoredManifest?: string | null
    /** Tags that exist; a request for anything else answers 404. */
    tags?: string[]
}

function stubGitHub(options: StubOptions = {}) {
    const tag = options.tag ?? 'v1.0.0'
    const assetName = options.assetName ?? ASSET_NAME
    const binary = options.binary ?? BINARY
    const assets = [
        { name: assetName, url: `https://api.github.com/assets/bin`, size: binary.length },
    ]
    if (options.checksums !== null) {
        assets.push({ name: 'checksums.txt', url: 'https://api.github.com/assets/sums', size: 64 })
    }

    const calls: string[] = []
    const impl = vi.fn(async (input: string | URL | Request) => {
        const url = String(input)
        calls.push(url)

        if (url.includes('/releases/latest') || url.includes('/releases/tags/')) {
            const requested = url.includes('/releases/tags/')
                ? decodeURIComponent(url.split('/releases/tags/')[1])
                : tag
            const known = options.tags ?? [tag]
            if (!known.includes(requested)) return new Response('{}', { status: 404 })
            return new Response(JSON.stringify({ tag_name: requested, assets }), { status: 200 })
        }
        if (url.endsWith('/assets/bin')) {
            return new Response(new Uint8Array(binary), { status: 200 })
        }
        if (url.endsWith('/assets/sums')) {
            const body = options.checksums ?? `${CHECKSUM}  ${assetName}\n`
            return new Response(body, { status: 200 })
        }
        if (url.includes('/contents/td-extension.json')) {
            if (options.authoredManifest === null) return new Response('', { status: 404 })
            return new Response(
                options.authoredManifest ??
                    JSON.stringify({ description: 'Track goals', requires: { td: '>=4.0.0' } }),
                { status: 200 },
            )
        }
        return new Response('{}', { status: 404 })
    })

    return { impl: impl as unknown as typeof fetch, calls, spy: impl }
}

describe('installExtension', () => {
    let root: string
    let extensionsDir: string
    let stateDir: string
    let warnings: string[]
    let logs: string[]

    function contextFor(fetchImpl: typeof fetch, reserved: string[] = []): InstallContext {
        return {
            binName: 'td',
            extensionsDir,
            stateDir,
            officialSource: { host: 'github.com', owner: 'Doist' },
            client: createGitHubClient(fetchImpl),
            reservedNames: () => reserved,
            log: (message) => logs.push(message),
            warn: (message) => warnings.push(message),
            trustWarning: 'Extensions are not reviewed, signed, or endorsed by Todoist.',
        }
    }

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'td-ext-install-'))
        extensionsDir = join(root, 'extensions')
        stateDir = join(root, 'state')
        warnings = []
        logs = []
    })

    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })

    describe('release binaries', () => {
        it('downloads the asset for this platform and records a manifest', async () => {
            const github = stubGitHub()
            const result = await installExtension('Doist/td-goals', {}, contextFor(github.impl))

            expect(result).toMatchObject({
                name: 'goals',
                dirName: 'td-goals',
                kind: 'binary',
                source: 'Doist/td-goals',
                version: 'v1.0.0',
            })

            const executable = join(extensionsDir, 'td-goals', 'td-goals')
            expect((await readFile(executable)).equals(BINARY)).toBe(true)
            expect((await stat(executable)).mode & 0o111).not.toBe(0)

            const manifest = JSON.parse(
                await readFile(join(extensionsDir, 'td-goals', '.td-manifest.json'), 'utf8'),
            )
            expect(manifest).toMatchObject({
                owner: 'Doist',
                name: 'td-goals',
                host: 'github.com',
                tag: 'v1.0.0',
                pinned: false,
                asset: ASSET_NAME,
                sha256: CHECKSUM,
            })
        })

        it("copies the author's description and requires into the manifest", async () => {
            const github = stubGitHub()
            await installExtension('Doist/td-goals', {}, contextFor(github.impl))

            const manifest = JSON.parse(
                await readFile(join(extensionsDir, 'td-goals', '.td-manifest.json'), 'utf8'),
            )
            expect(manifest.description).toBe('Track goals')
            expect(manifest.requires).toEqual({ td: '>=4.0.0' })
        })

        it('installs without a manifest when the repository ships none', async () => {
            const github = stubGitHub({ authoredManifest: null })
            await expect(
                installExtension('Doist/td-goals', {}, contextFor(github.impl)),
            ).resolves.toMatchObject({ kind: 'binary' })
        })

        it('refuses an asset whose checksum does not match, and installs nothing', async () => {
            const github = stubGitHub({ checksums: `${'0'.repeat(64)}  ${ASSET_NAME}\n` })

            await expect(
                installExtension('Doist/td-goals', {}, contextFor(github.impl)),
            ).rejects.toMatchObject({ code: 'EXTENSION_CHECKSUM_MISMATCH' })

            await expect(stat(join(extensionsDir, 'td-goals'))).rejects.toThrow()
        })

        it('warns, but installs, when the release publishes no checksums', async () => {
            const github = stubGitHub({ checksums: null })
            await installExtension('Doist/td-goals', {}, contextFor(github.impl))

            expect(warnings.some((warning) => warning.includes('publishes no checksums'))).toBe(
                true,
            )
        })

        it('resolves --pin against the tagged release rather than the latest one', async () => {
            const github = stubGitHub({ tag: 'v0.9.0', tags: ['v0.9.0', 'v1.0.0'] })
            const result = await installExtension(
                'Doist/td-goals',
                { pin: 'v0.9.0' },
                contextFor(github.impl),
            )

            expect(result.version).toBe('v0.9.0')
            expect(github.calls.some((url) => url.includes('/releases/tags/v0.9.0'))).toBe(true)
            expect(github.calls.some((url) => url.includes('/releases/latest'))).toBe(false)
            await expect(readState(stateDir, 'td-goals')).resolves.toMatchObject({
                pinned: 'v0.9.0',
            })
        })

        it('prints the trust warning before it fetches anything', async () => {
            const github = stubGitHub()
            const order: string[] = []
            const context = contextFor(github.impl)
            context.warn = (message) => {
                order.push(`warn: ${message}`)
                warnings.push(message)
            }
            // Fail the first request outright, so the install stops here
            // rather than falling through to a clone over the network.
            github.spy.mockImplementation((() => {
                order.push('fetch')
                throw new Error('network disabled in this test')
            }) as never)

            await expect(installExtension('Doist/td-goals', {}, context)).rejects.toThrow()

            expect(order).toEqual(['warn: ' + context.trustWarning, 'fetch'])
        })
    })

    describe('name and collision checks', () => {
        it('refuses a name that a built-in command already owns, before any request', async () => {
            const github = stubGitHub()

            await expect(
                installExtension('Doist/td-task', {}, contextFor(github.impl, ['task'])),
            ).rejects.toMatchObject({ code: 'EXTENSION_NAME_RESERVED' })

            expect(github.calls).toEqual([])
        })

        it('refuses a repository whose name lacks the binary prefix', async () => {
            const github = stubGitHub()

            await expect(
                installExtension('Doist/goals', {}, contextFor(github.impl)),
            ).rejects.toMatchObject({ code: 'EXTENSION_NAME_INVALID' })
        })

        it('refuses to replace an installed extension unless forced', async () => {
            await mkdir(extensionsDir, { recursive: true })
            await writeFixtureExtension(extensionsDir, 'goals')
            const github = stubGitHub()

            await expect(
                installExtension('Doist/td-goals', {}, contextFor(github.impl)),
            ).rejects.toMatchObject({ code: 'EXTENSION_ALREADY_INSTALLED' })

            await expect(
                installExtension('Doist/td-goals', { force: true }, contextFor(github.impl)),
            ).resolves.toMatchObject({ kind: 'binary' })
        })
    })

    describe('local installs', () => {
        it('links the directory instead of copying it', async () => {
            const workspace = join(root, 'code')
            await mkdir(workspace, { recursive: true })
            const target = await writeFixtureExtension(workspace, 'scratch')
            const github = stubGitHub()

            const result = await installExtension(target, {}, contextFor(github.impl))

            expect(result).toMatchObject({ name: 'scratch', kind: 'local', dir: target })
            const entry = join(extensionsDir, 'td-scratch')
            expect((await lstat(entry)).isSymbolicLink()).toBe(true)
            expect(github.calls).toEqual([])
        })

        it('warns when the directory has no executable yet, but still links it', async () => {
            const workspace = join(root, 'code', 'td-unbuilt')
            await mkdir(workspace, { recursive: true })
            const github = stubGitHub()

            await installExtension(workspace, {}, contextFor(github.impl))

            expect(warnings.some((warning) => warning.includes('no executable named'))).toBe(true)
        })

        it('refuses a directory whose name is not <bin>-<name>', async () => {
            const workspace = join(root, 'code', 'my-tool')
            await mkdir(workspace, { recursive: true })
            const github = stubGitHub()

            await expect(
                installExtension(workspace, {}, contextFor(github.impl)),
            ).rejects.toMatchObject({ code: 'EXTENSION_NAME_INVALID' })
        })

        it('refuses a directory that does not exist', async () => {
            const github = stubGitHub()

            await expect(
                installExtension(join(root, 'nope', 'td-x'), {}, contextFor(github.impl)),
            ).rejects.toMatchObject({ code: 'EXTENSION_NOT_INSTALLABLE' })
        })
    })

    describe('git clones', () => {
        let hasGit = false

        beforeEach(async () => {
            hasGit = (await run('git', ['--version'])).code === 0
        })

        async function makeRepo(name: string): Promise<string> {
            const repo = join(root, 'origin', 'Doist', name)
            await mkdir(repo, { recursive: true })
            await writeFile(join(repo, name), '#!/bin/sh\necho hi\n', { mode: 0o755 })
            await run('git', ['init', '--quiet', '--initial-branch=main'], { cwd: repo })
            await run('git', ['add', '.'], { cwd: repo })
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
                    'init',
                ],
                { cwd: repo },
            )
            return repo
        }

        it('clones when the repository publishes no matching asset', async () => {
            if (!hasGit) return
            const repo = await makeRepo('td-cloned')
            const github = stubGitHub({ assetName: 'td-cloned_v1_other-arch' })

            const result = await installExtension(`file://${repo}`, {}, contextFor(github.impl))

            expect(result).toMatchObject({ kind: 'git', name: 'cloned' })
            await expect(stat(join(extensionsDir, 'td-cloned', 'td-cloned'))).resolves.toBeTruthy()
            await expect(stat(join(extensionsDir, 'td-cloned', '.git'))).resolves.toBeTruthy()
        })

        it('refuses a repository with no executable at its root, leaving nothing behind', async () => {
            if (!hasGit) return
            const repo = join(root, 'origin', 'Doist', 'td-empty')
            await mkdir(repo, { recursive: true })
            await writeFile(join(repo, 'README.md'), 'nothing here')
            await run('git', ['init', '--quiet', '--initial-branch=main'], { cwd: repo })
            await run('git', ['add', '.'], { cwd: repo })
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
                    'init',
                ],
                { cwd: repo },
            )
            const github = stubGitHub({ assetName: 'td-empty_v1_other-arch' })

            await expect(
                installExtension(`file://${repo}`, {}, contextFor(github.impl)),
            ).rejects.toMatchObject({ code: 'EXTENSION_NOT_INSTALLABLE' })

            await expect(stat(join(extensionsDir, 'td-empty'))).rejects.toThrow()
        })
    })
})
