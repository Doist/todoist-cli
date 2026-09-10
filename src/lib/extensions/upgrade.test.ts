import { mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { writeFixtureExtension } from '../../test-support/extension-fixture.js'
import { discoverExtensions } from './discover.js'
import { createGitHubClient } from './github.js'
import type { InstallContext } from './install.js'
import { writeState } from './state.js'
import { mapWithConcurrency, upgradeExtension } from './upgrade.js'

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

describe('mapWithConcurrency', () => {
    it('never runs more than the limit at once', async () => {
        let active = 0
        let peak = 0

        await mapWithConcurrency(
            Array.from({ length: 12 }, (_, i) => i),
            4,
            async (item) => {
                active += 1
                peak = Math.max(peak, active)
                await new Promise((resolve) => setTimeout(resolve, 5))
                active -= 1
                return item
            },
        )

        expect(peak).toBeLessThanOrEqual(4)
    })

    it('keeps results in the order of the input', async () => {
        const results = await mapWithConcurrency([3, 1, 2], 2, async (item) => {
            await new Promise((resolve) => setTimeout(resolve, item))
            return item * 10
        })

        expect(results).toEqual([30, 10, 20])
    })
})

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
        await symlink(target, join(extensionsDir, 'td-scratch'), 'dir')

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

    it('upgrades past a pin only when forced', async () => {
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
