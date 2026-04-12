import { Command } from 'commander'
import { CURSOR_DESCRIPTION } from '../../lib/constants.js'
import { CliError } from '../../lib/errors.js'
import type { PaginatedViewOptions } from '../../lib/options.js'
import { addReminder } from './add.js'
import { deleteReminderCmd } from './delete.js'
import { getReminderCmd } from './get.js'
import type { ReminderTypeFilter } from './helpers.js'
import { listReminders } from './list.js'
import { registerLocationReminderCommand } from './location/index.js'
import { updateReminderCmd } from './update.js'

export function registerReminderCommand(program: Command): void {
    const reminder = program.command('reminder').description('Manage task reminders')

    reminder
        .command('list [task]')
        .description('List reminders (optionally filtered by task, or reminder type)')
        .option('--task <ref>', 'Task reference (name or id:xxx)')
        .option('--type <type>', 'Filter by type (time or location)', (v: string) => {
            if (v !== 'time' && v !== 'location') {
                throw new CliError('INVALID_TYPE', "--type must be 'time' or 'location'")
            }
            return v as ReminderTypeFilter
        })
        .option('--limit <n>', 'Limit number of results')
        .option('--cursor <cursor>', CURSOR_DESCRIPTION)
        .option('--all', 'Fetch all results (no limit)')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .action(
            (
                taskArg: string | undefined,
                options: PaginatedViewOptions & {
                    task?: string
                    type?: ReminderTypeFilter
                    limit?: string
                    cursor?: string
                    all?: boolean
                },
            ) => {
                if (taskArg && options.task) {
                    throw new CliError(
                        'CONFLICTING_OPTIONS',
                        'Cannot specify task both as argument and --task flag',
                    )
                }
                const task = taskArg || options.task
                return listReminders(task, options)
            },
        )

    const addCmd = reminder
        .command('add [task]')
        .description('Add a reminder to a task')
        .option('--task <ref>', 'Task reference (name or id:xxx)')
        .option('--before <duration>', 'Time before due (e.g., 30m, 1h)')
        .option('--at <datetime>', 'Specific time (e.g., 2024-01-15 10:00)')
        .option('--json', 'Output the created reminder as JSON')
        .option('--dry-run', 'Preview what would happen without executing')
        .action(
            (
                taskArg: string | undefined,
                options: {
                    before?: string
                    at?: string
                    json?: boolean
                    dryRun?: boolean
                    task?: string
                },
            ) => {
                if (taskArg && options.task) {
                    throw new CliError(
                        'CONFLICTING_OPTIONS',
                        'Cannot specify task both as argument and --task flag',
                    )
                }
                const task = taskArg || options.task
                if (!task) {
                    addCmd.help()
                    return
                }
                return addReminder(task, options)
            },
        )

    const updateCmd = reminder
        .command('update [id]')
        .description('Update a reminder')
        .option('--before <duration>', 'Time before due (e.g., 30m, 1h)')
        .option('--at <datetime>', 'Specific time (e.g., 2024-01-15 10:00)')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((id, options) => {
            if (!id) {
                updateCmd.help()
                return
            }
            return updateReminderCmd(id, options)
        })

    const deleteCmd = reminder
        .command('delete [id]')
        .description('Delete a reminder')
        .option('--yes', 'Confirm deletion')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((id, options) => {
            if (!id) {
                deleteCmd.help()
                return
            }
            return deleteReminderCmd(id, options)
        })

    const getCmd = reminder
        .command('get [id]')
        .description('Get a single time-based reminder by ID')
        .option('--json', 'Output as JSON')
        .option('--full', 'Include all fields in JSON output')
        .action((id, options) => {
            if (!id) {
                getCmd.help()
                return
            }
            return getReminderCmd(id, options)
        })

    registerLocationReminderCommand(reminder)
}
