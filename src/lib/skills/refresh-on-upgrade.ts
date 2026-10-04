import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getStateDir } from '@doist/cli-core'
import packageJson from '../../../package.json' with { type: 'json' }
import { APP_NAME } from '../app-name.js'

/**
 * Records the CLI version the installed agent skills were last refreshed for.
 * Lives in the state dir rather than the config file: it is bookkeeping, not
 * something a user sets.
 */
function getStampPath(): string {
    return join(getStateDir(APP_NAME), 'skills-version')
}

async function readStamp(): Promise<string | undefined> {
    try {
        return (await readFile(getStampPath(), 'utf8')).trim() || undefined
    } catch {
        return undefined
    }
}

export async function writeSkillsVersionStamp(version = packageJson.version): Promise<void> {
    const path = getStampPath()
    await mkdir(join(path, '..'), { recursive: true })
    await writeFile(path, `${version}\n`)
}

/**
 * Refresh the globally installed agent skills once after the CLI was upgraded.
 *
 * `postinstall` normally does this, but npm 11 skips install scripts for global
 * installs that are not allow-listed (and `td update` is a plain
 * `npm install -g`), so the installed SKILL.md kept describing the previous
 * version. Running it here, from the new binary, covers every install path.
 *
 * Only an upgrade triggers it: a stamp newer than the running version (an older
 * checkout run during development) leaves the installed skills alone. Cheap
 * when nothing changed: one small file read, no extra imports.
 */
export async function refreshSkillsAfterUpgrade(
    currentVersion = packageJson.version,
): Promise<void> {
    const stamped = await readStamp()
    if (stamped === currentVersion) return
    if (stamped) {
        const { isNewer } = await import('../update.js')
        if (!isNewer(stamped, currentVersion)) return
    }

    const { updateAllInstalledSkills } = await import('./update-installed.js')
    const { errors } = await updateAllInstalledSkills(false)
    // Leave the stamp behind on failure so the next run retries.
    if (errors.length === 0) {
        await writeSkillsVersionStamp(currentVersion)
    }
}
