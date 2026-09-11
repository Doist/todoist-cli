import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isFromNewerFormat, MANIFEST_VERSION, manifestVersionOf } from './manifest-format.js'
import {
    findManifestProblems,
    readAuthoredManifest,
    readInstalledManifest,
    writeInstalledManifest,
} from './manifest.js'

describe('manifests', () => {
    let dir: string

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'td-ext-manifest-'))
    })

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true })
    })

    describe('format version', () => {
        it('treats a manifest without a version as the original format', async () => {
            await writeFile(join(dir, 'td-extension.json'), JSON.stringify({ description: 'x' }))

            const manifest = await readAuthoredManifest(dir, 'td')

            expect(manifest?.manifestVersion).toBeUndefined()
            expect(manifestVersionOf(manifest)).toBe(MANIFEST_VERSION)
            expect(isFromNewerFormat(manifest)).toBe(false)
        })

        it('keeps a version it does not understand, so callers can explain themselves', async () => {
            await writeFile(
                join(dir, 'td-extension.json'),
                JSON.stringify({ manifestVersion: 99, description: 'from the future' }),
            )

            const manifest = await readAuthoredManifest(dir, 'td')

            // Still read for the fields this version knows: the extension is
            // an executable, and its metadata being newer is not a reason to
            // stop it working.
            expect(manifest?.description).toBe('from the future')
            expect(isFromNewerFormat(manifest)).toBe(true)
        })

        it('ignores a version that is not a whole number', async () => {
            await writeFile(
                join(dir, 'td-extension.json'),
                JSON.stringify({ manifestVersion: '2', description: 'x' }),
            )

            const manifest = await readAuthoredManifest(dir, 'td')

            expect(manifest?.manifestVersion).toBeUndefined()
            expect(isFromNewerFormat(manifest)).toBe(false)
        })

        it('refuses an install manifest written by a newer CLI', async () => {
            await writeFile(
                join(dir, '.td-manifest.json'),
                JSON.stringify({
                    manifestVersion: MANIFEST_VERSION + 1,
                    owner: 'Doist',
                    name: 'td-goals',
                    host: 'github.com',
                    tag: 'v1',
                    pinned: false,
                    asset: 'a',
                    installedAt: 'now',
                }),
            )

            // Reading it as though it were this format would be guessing.
            await expect(readInstalledManifest(dir, 'td')).resolves.toBeUndefined()
        })

        it('accepts an install manifest at the version it writes', async () => {
            await writeInstalledManifest(dir, 'td', {
                manifestVersion: MANIFEST_VERSION,
                owner: 'Doist',
                name: 'td-goals',
                host: 'github.com',
                tag: 'v1',
                pinned: false,
                asset: 'a',
                installedAt: 'now',
            })

            await expect(readInstalledManifest(dir, 'td')).resolves.toMatchObject({
                manifestVersion: MANIFEST_VERSION,
                tag: 'v1',
            })
        })
    })

    it('reads the dedicated author manifest', async () => {
        await writeFile(
            join(dir, 'td-extension.json'),
            JSON.stringify({ description: 'Goals', requires: { td: '>=4.0.0' }, completion: true }),
        )

        await expect(readAuthoredManifest(dir, 'td')).resolves.toEqual({
            description: 'Goals',
            requires: { td: '>=4.0.0' },
            completion: true,
        })
    })

    it('falls back to the host key in package.json for Node extensions', async () => {
        await writeFile(
            join(dir, 'package.json'),
            JSON.stringify({ name: 'td-goals', td: { description: 'From package.json' } }),
        )

        await expect(readAuthoredManifest(dir, 'td')).resolves.toEqual({
            description: 'From package.json',
        })
    })

    it('prefers the dedicated file when both exist', async () => {
        await writeFile(join(dir, 'td-extension.json'), JSON.stringify({ description: 'Wins' }))
        await writeFile(join(dir, 'package.json'), JSON.stringify({ td: { description: 'Loses' } }))

        await expect(readAuthoredManifest(dir, 'td')).resolves.toEqual({ description: 'Wins' })
    })

    it('ignores fields of the wrong type instead of failing', async () => {
        await writeFile(
            join(dir, 'td-extension.json'),
            JSON.stringify({ description: 42, requires: { td: 1, tdc: '>=1.0.0' } }),
        )

        await expect(readAuthoredManifest(dir, 'td')).resolves.toEqual({
            requires: { tdc: '>=1.0.0' },
        })
    })

    it('returns nothing when there is no manifest at all', async () => {
        await expect(readAuthoredManifest(dir, 'td')).resolves.toBeUndefined()
    })

    it('round-trips the manifest written at install time', async () => {
        const manifest = {
            owner: 'Doist',
            name: 'td-goals',
            host: 'github.com',
            tag: 'v1.0.0',
            pinned: false,
            asset: 'td-goals_v1.0.0_linux-x64',
            installedAt: '2026-09-07T10:12:00Z',
        }
        await writeInstalledManifest(dir, 'td', manifest)

        await expect(readInstalledManifest(dir, 'td')).resolves.toMatchObject(manifest)
    })

    it('treats a manifest without an owner or name as absent', async () => {
        await writeFile(join(dir, '.td-manifest.json'), JSON.stringify({ tag: 'v1' }))

        await expect(readInstalledManifest(dir, 'td')).resolves.toBeUndefined()
    })

    it('reports unparseable manifests for doctor, and stays quiet about missing ones', async () => {
        await expect(findManifestProblems(dir, 'td')).resolves.toEqual([])

        await writeFile(join(dir, 'td-extension.json'), '{ not json')
        await writeFile(join(dir, '.td-manifest.json'), '["an array"]')

        await expect(findManifestProblems(dir, 'td')).resolves.toEqual([
            'td-extension.json could not be read: not valid JSON',
            '.td-manifest.json is not a JSON object',
        ])
    })

    it('reports a manifest that exists but cannot be read', async () => {
        const path = join(dir, 'td-extension.json')
        await writeFile(path, JSON.stringify({ description: 'fine' }))
        await chmod(path, 0o000)

        const problems = await findManifestProblems(dir, 'td')

        // Running as root defeats permission bits, so only assert when the
        // file really is unreadable for this process.
        if (
            await readFile(path, 'utf8')
                .then(() => false)
                .catch(() => true)
        ) {
            expect(problems).toHaveLength(1)
            expect(problems[0]).toContain('could not be read')
        }
        await chmod(path, 0o600)
    })

    it('rejects an install manifest that is missing fields upgrades rely on', async () => {
        await writeFile(
            join(dir, '.td-manifest.json'),
            JSON.stringify({ name: 'td-goals', owner: 'Doist' }),
        )

        await expect(readInstalledManifest(dir, 'td')).resolves.toBeUndefined()
    })

    it('rejects an install manifest whose fields are the wrong type', async () => {
        await writeFile(
            join(dir, '.td-manifest.json'),
            JSON.stringify({
                owner: 'Doist',
                name: 'td-goals',
                host: 'github.com',
                tag: 3,
                pinned: false,
                asset: 'a',
                installedAt: 'now',
            }),
        )

        await expect(readInstalledManifest(dir, 'td')).resolves.toBeUndefined()
    })
})

describe('schema validation', () => {
    let dir: string

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'td-ext-schema-'))
    })

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true })
    })

    it('keeps unknown keys out without rejecting the manifest that carries them', async () => {
        await writeFile(
            join(dir, 'td-extension.json'),
            JSON.stringify({ description: 'fine', somethingNewer: { deeply: 'nested' } }),
        )

        // The format has to be able to grow without older CLIs refusing it.
        await expect(readAuthoredManifest(dir, 'td')).resolves.toEqual({ description: 'fine' })
    })

    it('drops one malformed requires entry rather than the whole field', async () => {
        await writeFile(
            join(dir, 'td-extension.json'),
            JSON.stringify({ requires: { td: 42, tdc: '>=1.0.0' } }),
        )

        await expect(readAuthoredManifest(dir, 'td')).resolves.toEqual({
            requires: { tdc: '>=1.0.0' },
        })
    })

    it('treats an empty requires map as asking for nothing', async () => {
        await writeFile(join(dir, 'td-extension.json'), JSON.stringify({ requires: {} }))

        await expect(readAuthoredManifest(dir, 'td')).resolves.toEqual({})
    })

    it.each([
        ['a JSON array', '[]'],
        ['a bare string', '"nope"'],
        ['null', 'null'],
    ])('treats %s as no manifest at all', async (_label, contents) => {
        await writeFile(join(dir, 'td-extension.json'), contents)

        await expect(readAuthoredManifest(dir, 'td')).resolves.toBeUndefined()
    })

    it('rejects an install manifest with an empty required field', async () => {
        await writeFile(
            join(dir, '.td-manifest.json'),
            JSON.stringify({
                owner: '',
                name: 'td-goals',
                host: 'github.com',
                tag: 'v1',
                pinned: false,
                asset: 'a',
                installedAt: 'now',
            }),
        )

        await expect(readInstalledManifest(dir, 'td')).resolves.toBeUndefined()
    })
})
