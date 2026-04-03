import { spawn } from 'node:child_process'
import chalk from 'chalk'
import packageJson from '../../../package.json' with { type: 'json' }
import { readConfig, type UpdateChannel } from '../../lib/config.js'
import { withSpinner } from '../../lib/spinner.js'

const PACKAGE_NAME = '@doist/todoist-cli'

interface RegistryResponse {
    version: string
}

function getInstallTag(channel: UpdateChannel): string {
    return channel === 'pre-release' ? 'next' : 'latest'
}

interface ParsedVersion {
    major: number
    minor: number
    patch: number
    prerelease: string | undefined
}

function parseVersion(version: string): ParsedVersion {
    const [core, ...rest] = version.split('-')
    const [major, minor, patch] = core.split('.').map(Number)
    return { major, minor, patch, prerelease: rest.length > 0 ? rest.join('-') : undefined }
}

/** Returns true when `candidate` is strictly newer than `current` per semver. */
function isNewer(current: string, candidate: string): boolean {
    const a = parseVersion(current)
    const b = parseVersion(candidate)

    // Compare major.minor.patch
    for (const key of ['major', 'minor', 'patch'] as const) {
        if (b[key] !== a[key]) return b[key] > a[key]
    }

    // Equal core: release > pre-release
    if (!a.prerelease && b.prerelease) return false
    if (a.prerelease && !b.prerelease) return true

    // Both pre-release: lexicographic (handles "next.1" vs "next.2" etc.)
    if (a.prerelease && b.prerelease)
        return b.prerelease.localeCompare(a.prerelease, undefined, { numeric: true }) > 0
    return false
}

async function fetchVersion(channel: UpdateChannel): Promise<string> {
    const url = `https://registry.npmjs.org/${PACKAGE_NAME}/${getInstallTag(channel)}`
    const response = await fetch(url)
    if (!response.ok) {
        throw new Error(`Registry request failed (HTTP ${response.status})`)
    }
    const data = (await response.json()) as RegistryResponse
    return data.version
}

function detectPackageManager(): string {
    const execPath = process.env.npm_execpath ?? ''
    if (execPath.includes('pnpm')) return 'pnpm'
    return 'npm'
}

function runInstall(pm: string, tag: string): Promise<{ exitCode: number; stderr: string }> {
    const command = pm === 'pnpm' ? 'add' : 'install'
    return new Promise((resolve, reject) => {
        const child = spawn(pm, [command, '-g', `${PACKAGE_NAME}@${tag}`], {
            stdio: 'pipe',
        })

        let stderr = ''
        child.stderr?.on('data', (data: Buffer) => {
            stderr += data.toString()
        })

        child.on('error', reject)
        child.on('close', (code) => resolve({ exitCode: code ?? 1, stderr }))
    })
}

function channelLabel(channel: UpdateChannel): string {
    return channel === 'pre-release' ? ` ${chalk.magenta('(pre-release)')}` : ''
}

export async function updateAction(options: { check?: boolean; channel?: boolean }): Promise<void> {
    const config = await readConfig()
    const channel: UpdateChannel = config.update_channel ?? 'stable'

    if (options.channel) {
        if (channel === 'pre-release') {
            console.log(`Update channel: ${chalk.magenta('pre-release')}`)
        } else {
            console.log(`Update channel: ${chalk.green('stable')}`)
        }
        return
    }

    const tag = getInstallTag(channel)
    const label = channelLabel(channel)

    const currentVersion = packageJson.version

    let latestVersion: string
    try {
        latestVersion = await withSpinner(
            { text: `Checking for updates${label}...`, color: 'blue' },
            () => fetchVersion(channel),
        )
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(chalk.red('Error:'), `Failed to check for updates: ${message}`)
        process.exitCode = 1
        return
    }

    const updateAvailable = isNewer(currentVersion, latestVersion)

    if (options.check) {
        const channelLine =
            channel === 'pre-release'
                ? `  Channel: ${chalk.magenta('pre-release')}`
                : `  Channel: ${chalk.green('stable')}`

        if (updateAvailable) {
            console.log(
                `Update available: ${chalk.dim(`v${currentVersion}`)} → ${chalk.green(`v${latestVersion}`)}`,
            )
        } else {
            console.log(chalk.green('✓'), `Already up to date (v${currentVersion})`)
        }
        console.log(channelLine)
        return
    }

    if (currentVersion === latestVersion) {
        console.log(chalk.green('✓'), `Already up to date${label} (v${currentVersion})`)
        return
    }

    if (updateAvailable) {
        console.log(
            `Update available${label}: ${chalk.dim(`v${currentVersion}`)} → ${chalk.green(`v${latestVersion}`)}`,
        )
    } else {
        console.log(
            `Downgrade available${label}: ${chalk.dim(`v${currentVersion}`)} → ${chalk.yellow(`v${latestVersion}`)}`,
        )
    }

    const pm = detectPackageManager()

    let result: { exitCode: number; stderr: string }
    try {
        result = await withSpinner(
            { text: `Updating to v${latestVersion}${label}...`, color: 'blue' },
            () => runInstall(pm, tag),
        )
    } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'EACCES') {
            console.error(chalk.red('Error:'), 'Permission denied. Try running with sudo:')
            console.error(
                chalk.dim(
                    `  sudo ${pm} ${pm === 'pnpm' ? 'add' : 'install'} -g ${PACKAGE_NAME}@${tag}`,
                ),
            )
        } else {
            const message = error instanceof Error ? error.message : String(error)
            console.error(chalk.red('Error:'), `Install failed: ${message}`)
        }
        process.exitCode = 1
        return
    }

    if (result.exitCode !== 0) {
        console.error(chalk.red('Error:'), `${pm} exited with code ${result.exitCode}`)
        if (result.stderr) {
            console.error(chalk.dim(result.stderr.trim()))
        }
        process.exitCode = 1
        return
    }

    console.log(chalk.green('✓'), `Updated to v${latestVersion}${label}`)
    if (channel === 'stable') {
        console.log(
            chalk.dim('  Run'),
            chalk.cyan('td changelog'),
            chalk.dim('to see what changed'),
        )
    }
}
