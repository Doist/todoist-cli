import { readConfig, type UpdateChannel } from './config.js'

const PACKAGE_NAME = '@doist/todoist-cli'

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

/** Returns true when `candidate` is strictly newer than `current` per semver. */
export function isNewer(current: string, candidate: string): boolean {
    const a = parseVersion(current)
    const b = parseVersion(candidate)

    for (const key of ['major', 'minor', 'patch'] as const) {
        if (b[key] !== a[key]) return b[key] > a[key]
    }

    if (!a.prerelease && b.prerelease) return false
    if (a.prerelease && !b.prerelease) return true

    if (a.prerelease && b.prerelease) {
        return b.prerelease.localeCompare(a.prerelease, undefined, { numeric: true }) > 0
    }

    return false
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
