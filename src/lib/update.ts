import { fetchLatestVersion as fetchLatestVersionCore } from '@doist/cli-core/commands'
import packageJson from '../../package.json' with { type: 'json' }
import { readConfig, type UpdateChannel } from './config.js'

export { compareVersions, getInstallTag, isNewer, parseVersion } from '@doist/cli-core/commands'

export async function fetchLatestVersion(channel: UpdateChannel): Promise<string> {
    return fetchLatestVersionCore({ packageName: packageJson.name, channel })
}

/**
 * Tolerant channel read for `td doctor`. Returns the raw configured value
 * (defaulting to `'stable'`); validation of unknown values is surfaced as a
 * separate warning by `validateConfigForDoctor`. The user-facing
 * `td update` command uses the strict cli-core version internally.
 */
export async function getConfiguredUpdateChannel(): Promise<UpdateChannel> {
    const config = await readConfig()
    return config.update_channel ?? 'stable'
}
