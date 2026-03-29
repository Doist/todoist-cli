import { Command } from 'commander'
import { addComment } from './add.js'
import { browseComment } from './browse.js'
import { deleteComment } from './delete.js'
import { listComments } from './list.js'
import { updateComment } from './update.js'
import { viewComment } from './view.js'

export function registerCommentCommand(program: Command): void {
    const comment = program.command('comment').description('Manage comments')

    const listCmd = comment
        .command('list [ref]')
        .description('List comments on a task (or project with --project)')
        .option('-P, --project', 'Target a project instead of a task')
        .option('--limit <n>', 'Limit number of results (default: 10)')
        .option('--all', 'Fetch all results (no limit)')
        .option('--show-urls', 'Show web app URLs for each comment')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .option('--lines <n>', 'Number of content lines to show (default: 3)')
        .option('--raw', 'Disable markdown rendering')
        .action((ref, options) => {
            if (!ref) {
                listCmd.help()
                return
            }
            return listComments(ref, options)
        })

    const addCmd = comment
        .command('add [ref]')
        .description('Add a comment to a task (or project with --project)')
        .option('-P, --project', 'Target a project instead of a task')
        .option('--content <text>', 'Comment content')
        .option('--stdin', 'Read comment content from stdin')
        .option('--file <path>', 'Attach a file to the comment')
        .option('--json', 'Output the created comment as JSON')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((ref, options) => {
            if (!ref || (!options.content && !options.stdin)) {
                addCmd.help()
                return
            }
            return addComment(ref, options)
        })

    const deleteCmd = comment
        .command('delete [id]')
        .description('Delete a comment')
        .option('--yes', 'Confirm deletion')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((id, options) => {
            if (!id) {
                deleteCmd.help()
                return
            }
            return deleteComment(id, options)
        })

    const updateCmd = comment
        .command('update [id]')
        .description('Update a comment')
        .option('--content <text>', 'New comment content (required)')
        .option('--json', 'Output the updated comment as JSON')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((id, options) => {
            if (!id || !options.content) {
                updateCmd.help()
                return
            }
            return updateComment(id, options)
        })

    comment
        .command('view [id]', { isDefault: true })
        .description('View a single comment with full details')
        .option('--raw', 'Disable markdown rendering')
        .action((id, options) => {
            if (!id) {
                comment.help()
                return
            }
            return viewComment(id, options)
        })

    const browseCmd = comment
        .command('browse [id]')
        .description('Open comment in browser (requires id:xxx)')
        .action((id) => {
            if (!id) {
                browseCmd.help()
                return
            }
            return browseComment(id)
        })
}
