import { Command, Option } from 'commander'
import { withCaseInsensitiveChoices } from '../../lib/completion.js'
import { CURSOR_DESCRIPTION } from '../../lib/constants.js'
import { TASK_SORT_DIRECTIONS, TASK_SORT_FIELDS } from '../../lib/task-sort.js'
import { browseFilter } from './browse.js'
import { createFilter } from './create.js'
import { deleteFilterCmd } from './delete.js'
import { listFilters } from './list.js'
import { updateFilterCmd } from './update.js'
import { showFilter } from './view.js'

export { showFilter } from './view.js'

export function registerFilterCommand(program: Command): void {
    const filter = program.command('filter').description('Manage filters')

    filter
        .command('list')
        .description('List all filters')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--ids-only', 'Output only IDs, one per line')
        .option('--full', 'Include all fields in JSON output')
        .option('--show-urls', 'Show web app URLs for each filter')
        .action(listFilters)

    const createCmd = filter
        .command('create')
        .description('Create a filter')
        .option('--name <name>', 'Filter name (required)')
        .option('--query <query>', 'Filter query (required, e.g., "today | overdue")')
        .option('--color <color>', 'Filter color')
        .option('--favorite', 'Mark as favorite')
        .option('--json', 'Output the created filter as JSON')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((options) => {
            if (!options.name || !options.query) {
                createCmd.help()
                return
            }
            return createFilter(options)
        })

    const deleteCmd = filter
        .command('delete [ref]')
        .description('Delete a filter')
        .option('--yes', 'Confirm deletion')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((ref, options) => {
            if (!ref) {
                deleteCmd.help()
                return
            }
            return deleteFilterCmd(ref, options)
        })

    const updateCmd = filter
        .command('update [ref]')
        .description('Update a filter')
        .option('--name <name>', 'New name')
        .option('--query <query>', 'New query')
        .option('--color <color>', 'New color')
        .option('--favorite', 'Mark as favorite')
        .option('--no-favorite', 'Remove from favorites')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((ref, options) => {
            if (!ref) {
                updateCmd.help()
                return
            }
            return updateFilterCmd(ref, options)
        })

    filter
        .command('view [ref]', { isDefault: true })
        .alias('show')
        .description('Show tasks matching a filter')
        .addOption(
            withCaseInsensitiveChoices(
                new Option('--sort <field>', "Sort tasks (default: the view's sorting in Todoist)"),
                [...TASK_SORT_FIELDS],
            ),
        )
        .addOption(
            withCaseInsensitiveChoices(
                new Option(
                    '--sort-order <direction>',
                    'Sort direction (the default and none sorts have no direction)',
                ),
                [...TASK_SORT_DIRECTIONS],
            ),
        )
        .option('--limit <n>', 'Limit results per filter section (default: 300)')
        .option('--cursor <cursor>', CURSOR_DESCRIPTION)
        .option('--all', 'Fetch all results (no limit)')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--ids-only', 'Output only task IDs, one per line')
        .option('--full', 'Include all fields in JSON output')
        .option('--show-urls', 'Show web app URLs for each task')
        .action((ref, options) => {
            if (!ref) {
                filter.help()
                return
            }
            return showFilter(ref, options)
        })

    const browseCmd = filter
        .command('browse [ref]')
        .description('Open filter in browser')
        .action((ref) => {
            if (!ref) {
                browseCmd.help()
                return
            }
            return browseFilter(ref)
        })
}
