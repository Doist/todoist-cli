import { Command, Option } from 'commander'
import { withCaseInsensitiveChoices } from '../../lib/completion.js'
import { formatError } from '../../lib/output.js'
import { PRIORITY_CHOICES } from '../../lib/task-list.js'
import type { AddOptions } from './add.js'
import { addTask } from './add.js'
import { browseTask } from './browse.js'
import { completeTask } from './complete.js'
import { deleteTask } from './delete.js'
import { listTasks } from './list.js'
import { moveTask } from './move.js'
import { rescheduleTask } from './reschedule.js'
import { uncompleteTask } from './uncomplete.js'
import { updateTask } from './update.js'
import { viewTask } from './view.js'

export { viewTask } from './view.js'

export function registerTaskCommand(program: Command): void {
    const task = program.command('task').description('Manage tasks')

    task.command('list')
        .description('List tasks')
        .option('--project <name>', 'Filter by project name or id:xxx')
        .option('--parent <ref>', 'Filter subtasks of a parent task')
        .option('--label <name>', 'Filter by label (comma-separated for multiple)')
        .addOption(
            withCaseInsensitiveChoices(
                new Option('--priority <p1-p4>', 'Filter by priority'),
                PRIORITY_CHOICES,
            ),
        )
        .option('--due <date>', 'Filter by due date (today, overdue, or YYYY-MM-DD)')
        .option('--filter <query>', 'Raw Todoist filter query')
        .option('--assignee <ref>', 'Filter by assignee (me or id:xxx)')
        .option('--unassigned', 'Show only unassigned tasks')
        .option('--workspace <name>', 'Filter to tasks in workspace')
        .option('--personal', 'Filter to tasks in personal projects')
        .option('--limit <n>', 'Limit number of results (default: 300)')
        .option('--cursor <cursor>', 'Continue from cursor')
        .option('--all', 'Fetch all results (no limit)')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .option('--raw', 'Disable markdown rendering')
        .option('--show-urls', 'Show web app URLs for each task')
        .action(listTasks)

    task.command('view [ref]', { isDefault: true })
        .description('View task details')
        .option('--json', 'Output as JSON')
        .option('--full', 'Include all fields in output')
        .option('--raw', 'Disable markdown rendering')
        .action((ref, options) => {
            if (!ref) {
                task.help()
                return
            }
            return viewTask(ref, options)
        })

    const completeCmd = task
        .command('complete [ref]')
        .description('Complete a task')
        .option('--forever', 'Complete recurring task permanently (stops recurrence)')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((ref, options) => {
            if (!ref) {
                completeCmd.help()
                return
            }
            return completeTask(ref, options)
        })

    const uncompleteCmd = task
        .command('uncomplete [ref]')
        .description('Reopen a completed task (requires id:xxx)')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((ref, options) => {
            if (!ref) {
                uncompleteCmd.help()
                return
            }
            return uncompleteTask(ref, options)
        })

    const deleteCmd = task
        .command('delete [ref]')
        .description('Delete a task')
        .option('--yes', 'Confirm deletion')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((ref, options) => {
            if (!ref) {
                deleteCmd.help()
                return
            }
            return deleteTask(ref, options)
        })

    const addCmd = task
        .command('add [content]')
        .description('Add a task')
        .option('--content <text>', 'Task content (legacy, prefer positional argument)')
        .option('--due <date>', 'Due date (natural language or YYYY-MM-DD)')
        .option('--deadline <date>', 'Deadline date (YYYY-MM-DD)')
        .addOption(
            withCaseInsensitiveChoices(
                new Option('--priority <p1-p4>', 'Priority level'),
                PRIORITY_CHOICES,
            ),
        )
        .option('--project <name>', 'Project name or id:xxx')
        .option('--section <ref>', 'Section (name with --project, or id:xxx)')
        .option('--labels <a,b>', 'Comma-separated labels')
        .option('--parent <ref>', 'Parent task reference')
        .option('--description <text>', 'Task description')
        .option('--stdin', 'Read task description from stdin')
        .option('--assignee <ref>', 'Assign to user (name, email, id:xxx, or "me")')
        .option('--duration <time>', 'Duration (e.g., 30m, 1h, 2h15m)')
        .option('--uncompletable', 'Mark task as non-completable (reference/header task)')
        .option('--order <number>', 'Task position within project/parent (0 = top)', (val) => {
            const n = Number(val)
            if (!Number.isInteger(n) || n < 0) {
                throw new Error(
                    formatError('INVALID_ORDER', `Invalid order value: "${val}"`, [
                        'Order must be a non-negative integer (e.g., 0 for top of list)',
                    ]),
                )
            }
            return n
        })
        .option('--json', 'Output the created task as JSON')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((contentArg: string | undefined, options: AddOptions & { content?: string }) => {
            if (contentArg && options.content) {
                throw new Error('Cannot specify content both as argument and --content flag')
            }
            const content = contentArg || options.content
            if (!content) {
                addCmd.help()
                return
            }
            return addTask({ ...options, content })
        })

    const updateCmd = task
        .command('update [ref]')
        .description('Update a task')
        .option('--content <text>', 'New content')
        .option('--due <date>', 'New due date')
        .option('--deadline <date>', 'Deadline date (YYYY-MM-DD)')
        .option('--no-deadline', 'Remove deadline')
        .addOption(
            withCaseInsensitiveChoices(
                new Option('--priority <p1-p4>', 'New priority'),
                PRIORITY_CHOICES,
            ),
        )
        .option('--labels <a,b>', 'New labels (replaces existing)')
        .option('--description <text>', 'New description')
        .option('--stdin', 'Read task description from stdin')
        .option('--assignee <ref>', 'Assign to user (name, email, id:xxx, or "me")')
        .option('--unassign', 'Remove assignee')
        .option('--duration <time>', 'Duration (e.g., 30m, 1h, 2h15m)')
        .option('--uncompletable', 'Mark task as non-completable')
        .option('--completable', 'Revert task to completable (undoes --uncompletable)')
        .option('--order <number>', 'Task position within project/parent (0 = top)', (val) => {
            const n = Number(val)
            if (!Number.isInteger(n) || n < 0) {
                throw new Error(
                    formatError('INVALID_ORDER', `Invalid order value: "${val}"`, [
                        'Order must be a non-negative integer (e.g., 0 for top of list)',
                    ]),
                )
            }
            return n
        })
        .option('--json', 'Output the updated task as JSON')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((ref, options) => {
            if (!ref) {
                updateCmd.help()
                return
            }
            return updateTask(ref, options)
        })

    const moveCmd = task
        .command('move [ref]')
        .description('Move task to project/section/parent')
        .option('--project <ref>', 'Target project (name or id:xxx)')
        .option('--section <ref>', 'Target section (name or id:xxx)')
        .option('--parent <ref>', 'Parent task (name or id:xxx)')
        .option('--no-parent', 'Remove parent (move to project root)')
        .option('--no-section', 'Remove section (move to project root)')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((ref, options) => {
            if (!ref) {
                moveCmd.help()
                return
            }
            return moveTask(ref, options)
        })

    const rescheduleCmd = task
        .command('reschedule [ref] [date]')
        .description('Reschedule a task (preserves recurrence)')
        .option('--json', 'Output the rescheduled task as JSON')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((ref, date, options) => {
            if (!ref || !date) {
                rescheduleCmd.help()
                return
            }
            return rescheduleTask(ref, date, options)
        })

    const browseCmd = task
        .command('browse [ref]')
        .description('Open task in browser')
        .action((ref) => {
            if (!ref) {
                browseCmd.help()
                return
            }
            return browseTask(ref)
        })
}
