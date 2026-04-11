import { Command } from 'commander'
import { CURSOR_DESCRIPTION } from '../../lib/constants.js'
import { listCompleted } from './list.js'

export function registerCompletedCommand(program: Command): void {
    const completed = program
        .command('completed')
        .description('Show completed tasks')
        .addHelpText(
            'after',
            `
Examples:
  td completed list
  td completed list --since 2024-01-01 --until 2024-01-31
  td completed list --search "meeting notes"`,
        )

    completed
        .command('list', { isDefault: true })
        .description('List completed tasks, or search by query')
        .option('--search <query>', 'Search completed tasks by query')
        .option('--since <date>', 'Start date (YYYY-MM-DD), default: today')
        .option('--until <date>', 'End date (YYYY-MM-DD), default: tomorrow')
        .option('--project <name>', 'Filter by project')
        .option('--limit <n>', 'Limit number of results (default: 300)')
        .option('--cursor <cursor>', CURSOR_DESCRIPTION)
        .option('--all', 'Fetch all results (no limit)')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .option('--show-urls', 'Show web app URLs for each task')
        .action(listCompleted)
}
