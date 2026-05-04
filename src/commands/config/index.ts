import { Command } from 'commander'
import { viewConfig } from './view.js'

export function registerConfigCommand(program: Command): void {
    const config = program.command('config').description('Manage CLI configuration')

    config
        .command('view')
        .description('Show the current CLI configuration file')
        .option('--json', 'Output the raw config as JSON')
        .option('--show-token', 'Include the full api_token instead of masking it')
        .action(viewConfig)

    config.addHelpText(
        'after',
        `
Examples:
  $ td config view                  # pretty-printed, token masked
  $ td config view --json           # raw JSON, token masked
  $ td config view --show-token     # include the full token`,
    )
}
