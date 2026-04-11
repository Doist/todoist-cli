import { Command } from 'commander'
import { browseLabel } from './browse.js'
import { createLabel } from './create.js'
import { deleteLabel } from './delete.js'
import { listLabels } from './list.js'
import { renameSharedLabel } from './rename-shared.js'
import { updateLabel } from './update.js'
import { viewLabel } from './view.js'

export { viewLabel } from './view.js'

export function registerLabelCommand(program: Command): void {
    const label = program
        .command('label')
        .description('Manage labels')
        .addHelpText(
            'after',
            `
Examples:
  td label list
  td label list --search "bug"
  td label create --name "urgent" --color red
  td label view "urgent"
  td label rename-shared "oldname" --name "newname"`,
        )

    label
        .command('view [ref]', { isDefault: true })
        .description('View label details and tasks')
        .option('--limit <n>', 'Limit number of results (default: 300)')
        .option('--all', 'Fetch all results (no limit)')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .option('--show-urls', 'Show web app URLs for each task')
        .action((ref, options) => {
            if (!ref) {
                label.help()
                return
            }
            return viewLabel(ref, options)
        })

    label
        .command('list')
        .description('List or search labels')
        .option('--search <term>', 'Search labels by name')
        .option('--limit <n>', 'Limit number of results (default: 300)')
        .option('--all', 'Fetch all results (no limit)')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .option('--show-urls', 'Show web app URLs for each label')
        .action(listLabels)

    const createCmd = label
        .command('create')
        .description('Create a label')
        .option('--name <name>', 'Label name (required)')
        .option('--color <color>', 'Label color')
        .option('--favorite', 'Mark as favorite')
        .option('--json', 'Output the created label as JSON')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((options) => {
            if (!options.name) {
                createCmd.help()
                return
            }
            return createLabel(options)
        })

    const deleteCmd = label
        .command('delete [name]')
        .description('Delete a label')
        .option('--yes', 'Confirm deletion')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((name, options) => {
            if (!name) {
                deleteCmd.help()
                return
            }
            return deleteLabel(name, options)
        })

    const updateCmd = label
        .command('update [ref]')
        .description('Update a label')
        .option('--name <name>', 'New name')
        .option('--color <color>', 'New color')
        .option('--favorite', 'Mark as favorite')
        .option('--no-favorite', 'Remove from favorites')
        .option('--json', 'Output the updated label as JSON')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((ref, options) => {
            if (!ref) {
                updateCmd.help()
                return
            }
            return updateLabel(ref, options)
        })

    const browseCmd = label
        .command('browse [ref]')
        .description('Open label in browser')
        .action((ref) => {
            if (!ref) {
                browseCmd.help()
                return
            }
            return browseLabel(ref)
        })

    const renameSharedCmd = label
        .command('rename-shared [name]')
        .description('Rename a shared label')
        .option('--name <name>', 'New name (required)')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((name, options) => {
            if (!name || !options.name) {
                renameSharedCmd.help()
                return
            }
            return renameSharedLabel(name, options)
        })
}
