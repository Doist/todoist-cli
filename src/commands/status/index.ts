import { Command } from 'commander'
import { clearStatus } from './clear.js'
import { showStatus } from './show.js'

export function registerStatusCommand(program: Command): void {
    const status = program
        .command('status')
        .description('Show or clear your status')
        .addHelpText(
            'after',
            `
Examples:
  td status
  td status clear`,
        )

    status
        .command('show', { isDefault: true })
        .description('Show your current status')
        .option('--json', 'Output as JSON')
        .addHelpText(
            'after',
            `
Examples:
  td status
  td status --json`,
        )
        .action(showStatus)

    status
        .command('clear')
        .description('Clear your status')
        .option('--dry-run', 'Show what would be cleared without clearing it')
        .action(clearStatus)
}
