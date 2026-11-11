import { registerUpdateCommand as registerCoreUpdateCommand } from '@doist/cli-core/commands'
import type { Command } from 'commander'
import packageJson from '../../../package.json' with { type: 'json' }
import { getConfigPath } from '../../lib/config.js'
import { isHomebrewInstall } from '../../lib/package-move.js'
import { withSpinner } from '../../lib/spinner.js'
import { runMove } from './move.js'

export function registerUpdateCommand(program: Command): void {
    registerCoreUpdateCommand(program, {
        packageName: packageJson.name,
        currentVersion: packageJson.version,
        configPath: getConfigPath(),
        changelogCommandName: 'td changelog',
        withSpinner,
    })

    // Homebrew installs keep cli-core's update: the formula moves them.
    if (isHomebrewInstall()) return

    // npm and pnpm installs switch to the new package instead. `update switch`
    // is a separate subcommand and keeps cli-core's behaviour.
    const update = program.commands.find((command) => command.name() === 'update')
    update?.action(async function (this: Command) {
        const { json, ndjson } = this.optsWithGlobals<{ json?: boolean; ndjson?: boolean }>()
        await runMove(
            {
                packageName: packageJson.name,
                currentVersion: packageJson.version,
                configPath: getConfigPath(),
            },
            { ...this.opts(), json, ndjson },
        )
    })
}
