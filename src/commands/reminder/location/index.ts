import type { Command } from 'commander'
import { CliError } from '../../../lib/errors.js'
import { addLocationReminderCmd } from './add.js'
import { deleteLocationReminderCmd } from './delete.js'
import { getLocationReminderCmd } from './get.js'
import { updateLocationReminderCmd } from './update.js'

export function registerLocationReminderCommand(reminder: Command): void {
    const location = reminder.command('location').description('Manage location-based reminders')

    const addCmd = location
        .command('add [task]')
        .description('Add a location reminder to a task')
        .option('--task <ref>', 'Task reference (name or id:xxx)')
        .option('--name <name>', 'Human-readable location name')
        .option('--lat <latitude>', 'Latitude (-90 to 90)')
        .option('--long <longitude>', 'Longitude (-180 to 180)')
        .option('--trigger <trigger>', 'Trigger condition (on_enter or on_leave)')
        .option('--radius <meters>', 'Radius in meters (positive integer)')
        .option('--json', 'Output the created reminder as JSON')
        .option('--dry-run', 'Preview what would happen without executing')
        .action(
            (
                taskArg: string | undefined,
                options: {
                    task?: string
                    name?: string
                    lat?: string
                    long?: string
                    trigger?: string
                    radius?: string
                    json?: boolean
                    dryRun?: boolean
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
                return addLocationReminderCmd(task, options)
            },
        )

    const updateCmd = location
        .command('update [id]')
        .description('Update a location reminder')
        .option('--name <name>', 'Human-readable location name')
        .option('--lat <latitude>', 'Latitude (-90 to 90)')
        .option('--long <longitude>', 'Longitude (-180 to 180)')
        .option('--trigger <trigger>', 'Trigger condition (on_enter or on_leave)')
        .option('--radius <meters>', 'Radius in meters (positive integer)')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((id, options) => {
            if (!id) {
                updateCmd.help()
                return
            }
            return updateLocationReminderCmd(id, options)
        })

    const deleteCmd = location
        .command('delete [id]')
        .description('Delete a location reminder')
        .option('--yes', 'Confirm deletion')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((id, options) => {
            if (!id) {
                deleteCmd.help()
                return
            }
            return deleteLocationReminderCmd(id, options)
        })

    const getCmd = location
        .command('get [id]')
        .description('Get a single location reminder by ID')
        .option('--json', 'Output as JSON')
        .option('--full', 'Include all fields in JSON output')
        .action((id, options) => {
            if (!id) {
                getCmd.help()
                return
            }
            return getLocationReminderCmd(id, options)
        })
}
