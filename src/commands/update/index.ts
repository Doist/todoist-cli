import { registerUpdateCommand as registerCoreUpdateCommand } from '@doist/cli-core/commands'
import type { Command } from 'commander'
import packageJson from '../../../package.json' with { type: 'json' }
import { getConfigPath } from '../../lib/config.js'
import { withSpinner } from '../../lib/spinner.js'

export function registerUpdateCommand(program: Command): void {
    registerCoreUpdateCommand(program, {
        packageName: packageJson.name,
        currentVersion: packageJson.version,
        configPath: getConfigPath(),
        changelogCommandName: 'td changelog',
        withSpinner,
    })
}
