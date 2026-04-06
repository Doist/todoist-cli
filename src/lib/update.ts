import { readConfig, type UpdateChannel } from './config.js'

export const PACKAGE_NAME = '@doist/todoist-cli'

interface RegistryResponse {
    version: string
}

interface ParsedVersion {
    major: number
    minor: number
    patch: number
    prerelease: string | undefined
}

export function getInstallTag(channel: UpdateChannel): string {
    return channel === 'pre-release' ? 'next' : 'latest'
}

export function parseVersion(version: string): ParsedVersion {
    const [core, ...rest] = version.replace(/^v/, '').split('-')
    const [major, minor, patch] = core.split('.').map(Number)
    return { major, minor, patch, prerelease: rest.length > 0 ? rest.join('-') : undefined }
}

export function compareVersions(a: string, b: string): number {
    const left = parseVersion(a)
    const right = parseVersion(b)

    for (const key of ['major', 'minor', 'patch'] as const) {
        if (left[key] !== right[key]) return left[key] > right[key] ? 1 : -1
    }

    if (!left.prerelease && right.prerelease) return 1
    if (left.prerelease && !right.prerelease) return -1

    if (left.prerelease && right.prerelease) {
        return left.prerelease.localeCompare(right.prerelease, undefined, { numeric: true })
    }

    return 0
}

/** Returns true when `candidate` is strictly newer than `current` per semver. */
export function isNewer(current: string, candidate: string): boolean {
    return compareVersions(candidate, current) > 0
}

export async function fetchLatestVersion(channel: UpdateChannel): Promise<string> {
    const url = `https://registry.npmjs.org/${PACKAGE_NAME}/${getInstallTag(channel)}`
    const response = await fetch(url)
    if (!response.ok) {
        throw new Error(`Registry request failed (HTTP ${response.status})`)
    }
    const data = (await response.json()) as RegistryResponse
    return data.version
}

export async function getConfiguredUpdateChannel(): Promise<UpdateChannel> {
    const config = await readConfig()
    return config.update_channel ?? 'stable'
}
