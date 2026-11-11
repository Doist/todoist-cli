import { spawn } from 'node:child_process'
import { emitView, getErrorMessage } from '@doist/cli-core'
import {
    fetchLatestVersion,
    getConfiguredUpdateChannel,
    getInstallTag,
} from '@doist/cli-core/commands'
import chalk from 'chalk'
import type { UpdateChannel } from '../../lib/config.js'
import { CliError } from '../../lib/errors.js'
import {
    detectPackageManager,
    NEW_PACKAGE_NAME,
    type PackageManager,
} from '../../lib/package-move.js'
import { stopEarlySpinner } from '../../lib/spinner.js'

export type MoveOptions = {
    /** This package's name, `@doist/todoist-cli`. */
    packageName: string
    currentVersion: string
    configPath: string
}

export type MoveFlags = {
    check?: boolean
    channel?: boolean
    json?: boolean
    ndjson?: boolean
}

function formatChannel(channel: UpdateChannel): string {
    return channel === 'pre-release' ? chalk.magenta('pre-release') : chalk.green('stable')
}

function uninstallArgs(pm: PackageManager, packageName: string): string[] {
    return [pm === 'pnpm' ? 'remove' : 'uninstall', '-g', packageName]
}

function installArgs(pm: PackageManager, spec: string): string[] {
    return [pm === 'pnpm' ? 'add' : 'install', '-g', spec]
}

/**
 * Run the package manager with its output streamed straight to the user.
 * Resolves to false on a non-zero exit or when it cannot be started at all.
 *
 * Everything this runs after the uninstall has to be loaded already: the
 * uninstall deletes this package's files, so a lazy import would fail.
 */
function runPackageManager(pm: PackageManager, args: string[]): Promise<boolean> {
    console.log(chalk.dim(`$ ${pm} ${args.join(' ')}`))
    return new Promise((resolve) => {
        const child = spawn(pm, args, {
            stdio: 'inherit',
            // npm and pnpm are `.cmd` shims on Windows, which spawn() only
            // resolves through the shell. Every argument here is a fixed
            // literal or a package name from this file, never user input.
            shell: process.platform === 'win32',
        })
        child.on('error', (error) => {
            console.error(chalk.red(`Could not run ${pm}: ${getErrorMessage(error)}`))
            resolve(false)
        })
        child.on('close', (code) => resolve(code === 0))
    })
}

/**
 * `td update` for an npm or pnpm install: replace `@doist/todoist-cli` with
 * `@todoist/cli` on the same channel. Both packages ship the `td` binary, so
 * the old one is removed first; if the new one then fails to install, the old
 * one is put back. `--check` and JSON/NDJSON output only report the move.
 */
export async function runMove(options: MoveOptions, flags: MoveFlags): Promise<void> {
    if (flags.check && flags.channel) {
        throw new CliError('INVALID_FLAGS', 'Specify either --check or --channel, not both.')
    }

    const view = { json: flags.json, ndjson: flags.ndjson }
    const channel = await getConfiguredUpdateChannel(options.configPath)

    if (flags.channel) {
        emitView(view, { channel }, () => [`Update channel: ${formatChannel(channel)}`])
        return
    }

    const { packageName, currentVersion } = options
    const tag = getInstallTag(channel)
    const newSpec = `${NEW_PACKAGE_NAME}@${tag}`
    const pm = detectPackageManager()
    const uninstall = uninstallArgs(pm, packageName)
    const install = installArgs(pm, newSpec)
    const manualCommands = [`${pm} ${uninstall.join(' ')}`, `${pm} ${install.join(' ')}`]

    if (flags.check || view.json || view.ndjson) {
        emitView(
            view,
            {
                currentVersion,
                channel,
                updateAvailable: true,
                movedTo: NEW_PACKAGE_NAME,
                command: 'td update',
                manualCommands,
            },
            () => [
                chalk.yellow(`td has moved to ${NEW_PACKAGE_NAME}.`),
                `  Installed: ${packageName} v${currentVersion}`,
                `  Run ${chalk.cyan('td update')} to switch, or by hand:`,
                ...manualCommands.map((command) => chalk.dim(`    ${command}`)),
            ],
        )
        return
    }

    // Make sure the new package can be installed before removing the old one.
    let newVersion: string
    try {
        newVersion = await fetchLatestVersion({ packageName: NEW_PACKAGE_NAME, distTag: tag })
    } catch (error) {
        throw new CliError(
            'UPDATE_CHECK_FAILED',
            `Could not look up ${newSpec}: ${getErrorMessage(error)}. Nothing was changed.`,
            channel === 'pre-release'
                ? ['Switch to the stable channel and try again: td update switch --stable']
                : [],
        )
    }

    stopEarlySpinner()
    console.log(
        `${chalk.yellow(`td has moved to ${NEW_PACKAGE_NAME}.`)} Switching from ${packageName} v${currentVersion} to ${NEW_PACKAGE_NAME} v${newVersion}.`,
    )

    if (!(await runPackageManager(pm, uninstall))) {
        throw new CliError(
            'UPDATE_INSTALL_FAILED',
            `${pm} could not uninstall ${packageName}. Nothing was changed.`,
            manualCommands.map((command) => `Run: ${command}`),
        )
    }

    if (!(await runPackageManager(pm, install))) {
        console.error(chalk.yellow(`Restoring ${packageName} v${currentVersion}...`))
        const restored = await runPackageManager(
            pm,
            installArgs(pm, `${packageName}@${currentVersion}`),
        )
        throw new CliError(
            'UPDATE_INSTALL_FAILED',
            restored
                ? `${pm} could not install ${newSpec}. ${packageName} v${currentVersion} has been restored.`
                : `${pm} could not install ${newSpec}, and could not restore ${packageName} v${currentVersion}, so td may no longer be installed.`,
            manualCommands.map((command) => `Run: ${command}`),
        )
    }

    console.log(`${chalk.green('✓')} Installed ${NEW_PACKAGE_NAME} v${newVersion}`)
    console.log(chalk.dim('  td keeps working with the same config and login.'))
}
