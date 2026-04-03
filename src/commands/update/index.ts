import { Command } from 'commander'
import { updateAction } from './action.js'
import { switchChannel } from './switch.js'

export function registerUpdateCommand(program: Command): void {
    const update = program
        .command('update')
        .description('Update the CLI to the latest version for the configured channel')
        .option('--check', 'Check for updates without installing')
        .option('--channel', 'Show the current update channel')
        .action(updateAction)

    update
        .command('switch')
        .description('Switch update channel between stable and pre-release')
        .option('--stable', 'Use the stable release channel')
        .option('--pre-release', 'Use the pre-release (next) channel')
        .action(switchChannel)
}
