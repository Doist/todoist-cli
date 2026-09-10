import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
