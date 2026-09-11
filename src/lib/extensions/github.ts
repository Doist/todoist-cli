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

/**
 * The REST API version to ask for.
 *
 * Pinned rather than left to default, so that GitHub moving its default can
 * never change what an install sees. Raise it deliberately, after checking the
 * endpoints used here still answer the same way: a release by tag and by
 * latest, an asset download, and a file's contents.
 */
const API_VERSION = '2026-03-10'

/**
 * Turn a repository-relative path into one URL path segment at a time.
 *
 * Encoding alone is not enough, because `..` is made of unreserved characters
 * and survives `encodeURIComponent` intact. Left in, it would climb out of
 * `/contents/` and point this authenticated request — which carries the
 * user's GitHub token — at a different repository.
 */
export function encodeRepoPath(path: string): string {
    const segments = path.split('/').filter(Boolean)
    if (segments.length === 0 || segments.some((segment) => segment === '.' || segment === '..')) {
        throw new CliError(
            'EXTENSION_NOT_INSTALLABLE',
            `"${path}" is not a valid path inside a repository.`,
        )
    }
    return segments.map(encodeURIComponent).join('/')
}

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
                'x-github-api-version': API_VERSION,
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
            const url = `${API_ROOT}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeRepoPath(path)}${query}`
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
 * What a release says the checksum of one asset should be, from either a
 * per-asset `<asset>.sha256` or a shared checksum file.
 */
export type ChecksumLookup = {
    /** True when the release publishes checksums at all. */
    published: boolean
    /** The checksum for this asset, when the release names it. */
    hash?: string
}

export async function findExpectedChecksum(
    client: GitHubClient,
    release: Release,
    assetName: string,
): Promise<ChecksumLookup> {
    const perAsset = release.assets.find((asset) => asset.name === `${assetName}.sha256`)
    if (perAsset) {
        const text = await client.fetchAssetText(perAsset)
        const hash = findChecksumLine(text, assetName) ?? text.trim().split(/\s+/)[0]?.toLowerCase()
        return hash ? { published: true, hash } : { published: true }
    }

    const combined = release.assets.find(
        (asset) => asset.name === 'checksums.txt' || asset.name.endsWith('_checksums.txt'),
    )
    if (!combined) return { published: false }

    const text = await client.fetchAssetText(combined)
    const hash = findChecksumLine(text, assetName)
    // A published checksum file that says nothing about this asset is a
    // problem with the release, not an absence of checksums: treating it as
    // "none published" would install an unverified binary and say so
    // inaccurately.
    return hash ? { published: true, hash } : { published: true }
}

/**
 * Both spellings a checksum file comes in: the coreutils form
 * `<hash>  <name>`, and the BSD form `SHA256 (<name>) = <hash>` that macOS
 * and some release tooling produce.
 */
function findChecksumLine(text: string, assetName: string): string | undefined {
    for (const rawLine of text.split('\n')) {
        const line = rawLine.trim()
        if (!line) continue

        const bsd = line.match(/^\w+\s*\(([^)]+)\)\s*=\s*([0-9a-fA-F]+)$/)
        if (bsd) {
            if (bsd[1] === assetName) return bsd[2].toLowerCase()
            continue
        }

        const [hash, ...rest] = line.split(/\s+/)
        const name = rest.join(' ').replace(/^\*/, '')
        if (name === assetName) return hash.toLowerCase()
    }
    return undefined
}

export function sha256(data: Buffer): string {
    return createHash('sha256').update(data).digest('hex')
}

/**
 * Check a download against what the release published.
 *
 * A release that publishes checksums but names no entry for this asset is
 * refused rather than installed unverified: the file the user is about to run
 * was meant to be covered and is not.
 */
export function verifyChecksum(data: Buffer, lookup: ChecksumLookup, assetName: string): void {
    if (!lookup.published) return

    if (!lookup.hash) {
        throw new CliError(
            'EXTENSION_CHECKSUM_MISMATCH',
            `This release publishes checksums but lists none for ${assetName}.`,
            {
                hints: [
                    'The release is incomplete, so the download cannot be verified.',
                    'Ask the extension author to publish a checksum for every asset.',
                ],
            },
        )
    }

    const expected = lookup.hash
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
