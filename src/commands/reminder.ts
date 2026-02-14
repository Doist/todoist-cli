import chalk from 'chalk'
import { Command } from 'commander'
import { getApi } from '../lib/api/core.js'
import {
    addReminder as apiAddReminder,
    deleteReminder as apiDeleteReminder,
    updateReminder as apiUpdateReminder,
    fetchReminders,
    getTaskReminders,
    type Reminder,
    type ReminderDue,
} from '../lib/api/reminders.js'
import { formatDuration, parseDuration } from '../lib/duration.js'
import type { PaginatedViewOptions } from '../lib/options.js'
import { formatError, formatPaginatedJson, formatPaginatedNdjson } from '../lib/output.js'
import { lenientIdRef, resolveTaskRef } from '../lib/refs.js'

function formatReminderTime(reminder: Reminder): string {
    if (reminder.minuteOffset != null) {
        return `${formatDuration(reminder.minuteOffset)} before due`
    }
    if (reminder.due?.date) {
        const date = reminder.due.date
        if (date.includes('T')) {
            return `at ${date.replace('T', ' ').slice(0, 16)}`
        }
        return `at ${date}`
    }
    return 'unknown time'
}

async function listReminders(taskRef: string, options: PaginatedViewOptions): Promise<void> {
    const api = await getApi()
    const task = await resolveTaskRef(api, taskRef)
    const reminders = await getTaskReminders(task.id)

    if (options.json) {
        console.log(
            formatPaginatedJson({ results: reminders, nextCursor: null }, 'reminder', options.full),
        )
        return
    }

    if (options.ndjson) {
        console.log(
            formatPaginatedNdjson(
                { results: reminders, nextCursor: null },
                'reminder',
                options.full,
            ),
        )
        return
    }

    if (reminders.length === 0) {
        console.log('No reminders.')
        return
    }

    for (const reminder of reminders) {
        const id = chalk.dim(reminder.id)
        const time = formatReminderTime(reminder)
        console.log(`${id}  ${time}`)
    }
}

function parseDateTime(value: string): ReminderDue {
    const trimmed = value.trim()

    // ISO format: 2024-01-15T10:00:00
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) {
        return { date: trimmed }
    }

    // Space format: 2024-01-15 10:00
    const spaceMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/)
    if (spaceMatch) {
        return { date: `${spaceMatch[1]}T${spaceMatch[2]}:00` }
    }

    // Date only: 2024-01-15
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return { date: trimmed }
    }

    throw new Error(
        formatError('INVALID_DATETIME', `Invalid datetime format: "${value}"`, [
            'Examples: 2024-01-15 10:00, 2024-01-15T10:00:00, 2024-01-15',
        ]),
    )
}

interface AddOptions {
    before?: string
    at?: string
}

async function addReminder(taskRef: string, options: AddOptions): Promise<void> {
    if (!options.before && !options.at) {
        console.log(formatError('MISSING_TIME', 'Must specify --before or --at'))
        process.exitCode = 1
        return
    }

    if (options.before && options.at) {
        console.log(formatError('CONFLICTING_OPTIONS', 'Cannot use both --before and --at'))
        process.exitCode = 1
        return
    }

    const api = await getApi()
    const task = await resolveTaskRef(api, taskRef)

    if (options.before) {
        const taskDue = task.due as { date?: string } | null
        if (!taskDue?.date) {
            console.log(
                formatError('NO_DUE_DATE', 'Cannot use --before: task has no due date', [
                    'Use --at to set a specific reminder time instead',
                ]),
            )
            process.exitCode = 1
            return
        }
        if (!taskDue.date.includes('T')) {
            console.log(
                formatError('NO_DUE_TIME', 'Cannot use --before: task has a due date but no time', [
                    'Use --at to set a specific reminder time, or add a time to the task',
                ]),
            )
            process.exitCode = 1
            return
        }
    }

    let minuteOffset: number | undefined
    let due: ReminderDue | undefined

    if (options.before) {
        const parsed = parseDuration(options.before)
        if (parsed === null) {
            console.log(
                formatError('INVALID_DURATION', `Invalid duration format: "${options.before}"`, [
                    'Examples: 30m, 1h, 2h15m, 1 hour 30 minutes',
                ]),
            )
            process.exitCode = 1
            return
        }
        minuteOffset = parsed
    }

    if (options.at) {
        due = parseDateTime(options.at)
    }

    const reminderId = await apiAddReminder({
        itemId: task.id,
        minuteOffset,
        due,
    })

    if (minuteOffset !== undefined) {
        console.log(`Added reminder: ${formatDuration(minuteOffset)} before due`)
    } else if (due) {
        console.log(`Added reminder: at ${due.date.replace('T', ' ')}`)
    }
    console.log(chalk.dim(`ID: ${reminderId}`))
}

interface UpdateOptions {
    before?: string
    at?: string
}

async function updateReminderCmd(reminderId: string, options: UpdateOptions): Promise<void> {
    if (!options.before && !options.at) {
        console.log(formatError('MISSING_TIME', 'Must specify --before or --at'))
        process.exitCode = 1
        return
    }

    if (options.before && options.at) {
        console.log(formatError('CONFLICTING_OPTIONS', 'Cannot use both --before and --at'))
        process.exitCode = 1
        return
    }

    const id = lenientIdRef(reminderId, 'reminder')

    let minuteOffset: number | undefined
    let due: ReminderDue | undefined

    if (options.before) {
        const parsed = parseDuration(options.before)
        if (parsed === null) {
            console.log(
                formatError('INVALID_DURATION', `Invalid duration format: "${options.before}"`, [
                    'Examples: 30m, 1h, 2h15m, 1 hour 30 minutes',
                ]),
            )
            process.exitCode = 1
            return
        }
        minuteOffset = parsed
    }

    if (options.at) {
        due = parseDateTime(options.at)
    }

    await apiUpdateReminder(id, { minuteOffset, due })

    if (minuteOffset !== undefined) {
        console.log(`Updated reminder: ${formatDuration(minuteOffset)} before due`)
    } else if (due) {
        console.log(`Updated reminder: at ${due.date.replace('T', ' ')}`)
    }
}

interface DeleteOptions {
    yes?: boolean
}

async function deleteReminderCmd(reminderId: string, options: DeleteOptions): Promise<void> {
    const id = lenientIdRef(reminderId, 'reminder')

    const reminders = await fetchReminders()
    const reminder = reminders.find((r) => r.id === id)

    if (!reminder) {
        console.log(formatError('NOT_FOUND', `Reminder not found: ${id}`))
        process.exitCode = 1
        return
    }

    const timeDesc = formatReminderTime(reminder)

    if (!options.yes) {
        console.log(`Would delete reminder: ${timeDesc}`)
        console.log('Use --yes to confirm.')
        return
    }

    await apiDeleteReminder(id)
    console.log(`Deleted reminder: ${timeDesc}`)
}

export function registerReminderCommand(program: Command): void {
    const reminder = program.command('reminder').description('Manage task reminders')

    const listCmd = reminder
        .command('list [task]')
        .description('List reminders for a task')
        .option('--task <ref>', 'Task reference (name or id:xxx)')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .action(
            (taskArg: string | undefined, options: PaginatedViewOptions & { task?: string }) => {
                if (taskArg && options.task) {
                    throw new Error('Cannot specify task both as argument and --task flag')
                }
                const task = taskArg || options.task
                if (!task) {
                    listCmd.help()
                    return
                }
                return listReminders(task, options)
            },
        )

    const addCmd = reminder
        .command('add [task]')
        .description('Add a reminder to a task')
        .option('--task <ref>', 'Task reference (name or id:xxx)')
        .option('--before <duration>', 'Time before due (e.g., 30m, 1h)')
        .option('--at <datetime>', 'Specific time (e.g., 2024-01-15 10:00)')
        .action((taskArg: string | undefined, options: AddOptions & { task?: string }) => {
            if (taskArg && options.task) {
                throw new Error('Cannot specify task both as argument and --task flag')
            }
            const task = taskArg || options.task
            if (!task) {
                addCmd.help()
                return
            }
            return addReminder(task, options)
        })

    const updateCmd = reminder
        .command('update [id]')
        .description('Update a reminder')
        .option('--before <duration>', 'Time before due (e.g., 30m, 1h)')
        .option('--at <datetime>', 'Specific time (e.g., 2024-01-15 10:00)')
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
        .action((id, options) => {
            if (!id) {
                deleteCmd.help()
                return
            }
            return deleteReminderCmd(id, options)
        })
}
