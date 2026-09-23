import { describe, expect, it, vi } from 'vitest'
import {
    assetSuffixes,
    createGitHubClient,
    findExpectedChecksum,
    pickAsset,
    sha256,
    verifyChecksum,
} from './github.js'

const BINARY = Buffer.from('binary contents')
const HASH = sha256(BINARY)

function clientFor(files: Record<string, string>) {
    const calls: string[] = []
    const impl = vi.fn(async (input: string | URL | Request) => {
        const url = String(input)
        calls.push(url)
        const body = files[url]
        if (body === undefined) return new Response('', { status: 404 })
        return new Response(body, { status: 200 })
    }) as unknown as typeof fetch
    return { client: createGitHubClient(impl), calls }
}

describe('assetSuffixes', () => {
    it('names the build this machine can run', () => {
        expect(assetSuffixes('linux', 'x64')).toEqual(['linux-x64'])
        expect(assetSuffixes('darwin', 'arm64')).toEqual(['darwin-arm64'])
    })

    it('prefers the .exe spelling on Windows but accepts either', () => {
        expect(assetSuffixes('win32', 'x64')).toEqual(['win32-x64.exe', 'win32-x64'])
    })
})

describe('pickAsset', () => {
    const assets = [
        { name: 'td-goals_v1_darwin-arm64', url: 'a', size: 1 },
        { name: 'td-goals_v1_linux-x64', url: 'b', size: 1 },
    ]

    it('matches on the platform suffix wherever the version sits in the name', () => {
        expect(pickAsset(assets, ['linux-x64'])?.url).toBe('b')
    })

    it('returns nothing when the release has no build for this machine', () => {
        expect(pickAsset(assets, ['win32-x64.exe', 'win32-x64'])).toBeUndefined()
    })
})

describe('findExpectedChecksum', () => {
    const asset = { name: 'td-goals_v1_linux-x64', url: 'https://api.github.com/a', size: 1 }
    const sums = { name: 'checksums.txt', url: 'https://api.github.com/sums', size: 1 }

    it('reports that a release publishes no checksums', async () => {
        const { client } = clientFor({})
        const release = { tag: 'v1', assets: [asset] }

        await expect(findExpectedChecksum(client, release, asset.name)).resolves.toEqual({
            published: false,
        })
    })

    it('reads the coreutils format', async () => {
        const { client } = clientFor({
            'https://api.github.com/sums': `${HASH}  ${asset.name}\n`,
        })
        const release = { tag: 'v1', assets: [asset, sums] }

        await expect(findExpectedChecksum(client, release, asset.name)).resolves.toEqual({
            published: true,
            hash: HASH,
        })
    })

    it('reads the BSD format that macOS tooling produces', async () => {
        const { client } = clientFor({
            'https://api.github.com/sums': `SHA256 (${asset.name}) = ${HASH}\n`,
        })
        const release = { tag: 'v1', assets: [asset, sums] }

        await expect(findExpectedChecksum(client, release, asset.name)).resolves.toEqual({
            published: true,
            hash: HASH,
        })
    })

    it('reports a checksum file that says nothing about this asset', async () => {
        const { client } = clientFor({
            'https://api.github.com/sums': `${HASH}  some-other-asset\n`,
        })
        const release = { tag: 'v1', assets: [asset, sums] }

        await expect(findExpectedChecksum(client, release, asset.name)).resolves.toEqual({
            published: true,
        })
    })
})

describe('verifyChecksum', () => {
    it('accepts a download the release vouches for', () => {
        expect(() => verifyChecksum(BINARY, { published: true, hash: HASH }, 'asset')).not.toThrow()
    })

    it('refuses a download that does not match', () => {
        expect(() =>
            verifyChecksum(BINARY, { published: true, hash: '0'.repeat(64) }, 'asset'),
        ).toThrow(/does not match/)
    })

    it('allows a release that publishes no checksums at all', () => {
        expect(() => verifyChecksum(BINARY, { published: false }, 'asset')).not.toThrow()
    })

    it('refuses a release that publishes checksums but omits this asset', () => {
        // Installing unverified here would be worse than failing: the release
        // meant to cover this file and does not.
        expect(() => verifyChecksum(BINARY, { published: true }, 'asset')).toThrow(
            /lists none for asset/,
        )
    })
})

describe('fetchRepoFile', () => {
    it('refuses a path that would climb out of the repository', async () => {
        const { client, calls } = clientFor({})

        // The request carries the user's GitHub token, so a path that escapes
        // /contents/ would read from a repository they never asked about.
        await expect(
            client.fetchRepoFile('Doist', 'td-goals', '../../../other/repo/contents/secret'),
        ).rejects.toThrow(/not a valid path/)
        expect(calls).toEqual([])
    })

    it('encodes each segment of a legitimate path', async () => {
        const { client, calls } = clientFor({})

        await client.fetchRepoFile('Doist', 'td-goals', 'dir/td extension.json', 'v1.0.0')

        expect(calls[0]).toBe(
            'https://api.github.com/repos/Doist/td-goals/contents/dir/td%20extension.json?ref=v1.0.0',
        )
    })
})
