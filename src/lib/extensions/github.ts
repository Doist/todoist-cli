/**
 * The slice of the GitHub API the extension system uses: look up a release,
 * download an asset, and read a file out of the repository.
 *
 * `GH_TOKEN` / `GITHUB_TOKEN` are honoured when set, so extensions in private
 * repositories install without any extra configuration.
 */

import { createHash } from 'node:crypto'
import { CliError } from '@doist/cli-core'

export type ReleaseAsset = {
    name: string
    /** API URL that serves the bytes when asked for `application/octet-stream`. */
    url: string
    size: number
}

export type Release = {
    tag: string
    assets: ReleaseAsset[]
}

export type GitHubClient = {
    fetchRelease(owner: string, repo: string, tag?: string): Promise<Release | undefined>
    downloadAsset(asset: ReleaseAsset): Promise<Buffer>
    fetchAssetText(asset: ReleaseAsset): Promise<string>
    fetchRepoFile(
        owner: string,
        repo: string,
        path: string,
        ref?: string,
    ): Promise<string | undefined>
}

const API_ROOT = 'https://api.github.com'

function authHeaders(): Record<string, string> {
    const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
    return token ? { authorization: `Bearer ${token}` } : {}
}

function failed(response: Response, what: string): CliError {
    const hints =
        response.status === 403 || response.status === 429
            ? ['GitHub may be rate limiting you. Set GH_TOKEN to raise the limit.']
            : response.status === 401
              ? ['Check that GH_TOKEN or GITHUB_TOKEN is valid.']
              : []
    return new CliError(
        'EXTENSION_NOT_INSTALLABLE',
        `GitHub returned ${response.status} for ${what}.`,
        { hints },
    )
}

export function createGitHubClient(fetchImpl: typeof fetch = fetch): GitHubClient {
    async function request(url: string, accept: string): Promise<Response> {
        return fetchImpl(url, {
            headers: {
                accept,
                'user-agent': 'doist-cli-extensions',
                'x-github-api-version': '2022-11-28',
                ...authHeaders(),
            },
        })
    }

    return {
        async fetchRelease(owner, repo, tag) {
            const path = tag ? `releases/tags/${encodeURIComponent(tag)}` : 'releases/latest'
            const url = `${API_ROOT}/repos/${owner}/${repo}/${path}`
            const response = await request(url, 'application/vnd.github+json')

            if (response.status === 404) return undefined
            if (!response.ok) throw failed(response, `${owner}/${repo} ${path}`)

            const body = (await response.json()) as {
                tag_name?: string
                assets?: { name?: string; url?: string; size?: number }[]
            }
            return {
                tag: body.tag_name ?? tag ?? '',
                assets: (body.assets ?? [])
                    .filter(
                        (asset): asset is { name: string; url: string; size: number } =>
                            typeof asset.name === 'string' && typeof asset.url === 'string',
                    )
                    .map((asset) => ({ name: asset.name, url: asset.url, size: asset.size ?? 0 })),
            }
        },

        async downloadAsset(asset) {
            const response = await request(asset.url, 'application/octet-stream')
            if (!response.ok) throw failed(response, `asset ${asset.name}`)
            return Buffer.from(await response.arrayBuffer())
        },

        async fetchAssetText(asset) {
            const response = await request(asset.url, 'application/octet-stream')
            if (!response.ok) throw failed(response, `asset ${asset.name}`)
            return response.text()
        },

        async fetchRepoFile(owner, repo, path, ref) {
            const query = ref ? `?ref=${encodeURIComponent(ref)}` : ''
            const url = `${API_ROOT}/repos/${owner}/${repo}/contents/${path}${query}`
            const response = await request(url, 'application/vnd.github.raw')
            if (response.status === 404) return undefined
            if (!response.ok) throw failed(response, `${owner}/${repo} ${path}`)
            return response.text()
        },
    }
}

/**
 * Asset name endings that identify a build for this machine. Node's own
 * `platform`-`arch` spelling is used, since an extension author working in
 * Node already has those values to hand.
 */
export function assetSuffixes(
    platform: NodeJS.Platform = process.platform,
    arch: string = process.arch,
): string[] {
    const base = `${platform}-${arch}`
    return platform === 'win32' ? [`${base}.exe`, base] : [base]
}

export function pickAsset(assets: ReleaseAsset[], suffixes: string[]): ReleaseAsset | undefined {
    for (const suffix of suffixes) {
        const match = assets.find((asset) => asset.name.endsWith(suffix))
        if (match) return match
    }
    return undefined
}

/**
 * The checksum a release publishes for one asset, from either a shared
 * `checksums.txt` or a per-asset `<asset>.sha256`. Returns undefined when the
 * release publishes neither, which is not an error — only a mismatch is.
 */
export async function findExpectedChecksum(
    client: GitHubClient,
    release: Release,
    assetName: string,
): Promise<string | undefined> {
    const perAsset = release.assets.find((asset) => asset.name === `${assetName}.sha256`)
    if (perAsset) {
        const text = await client.fetchAssetText(perAsset)
        return text.trim().split(/\s+/)[0]?.toLowerCase()
    }

    const combined = release.assets.find(
        (asset) => asset.name === 'checksums.txt' || asset.name.endsWith('_checksums.txt'),
    )
    if (!combined) return undefined

    const text = await client.fetchAssetText(combined)
    for (const line of text.split('\n')) {
        const [hash, ...rest] = line.trim().split(/\s+/)
        const name = rest.join(' ').replace(/^\*/, '')
        if (name === assetName) return hash.toLowerCase()
    }
    return undefined
}

export function sha256(data: Buffer): string {
    return createHash('sha256').update(data).digest('hex')
}

export function verifyChecksum(
    data: Buffer,
    expected: string | undefined,
    assetName: string,
): void {
    if (!expected) return
    const actual = sha256(data)
    if (actual !== expected) {
        throw new CliError(
            'EXTENSION_CHECKSUM_MISMATCH',
            `The downloaded asset ${assetName} does not match the published checksum.`,
            {
                hints: [
                    `Expected ${expected}`,
                    `Got      ${actual}`,
                    'The download may be corrupt or the release may have been tampered with.',
                ],
            },
        )
    }
}
