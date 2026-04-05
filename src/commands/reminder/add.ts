import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import {
    addReminder as apiAddReminder,
    type Reminder,
    type ReminderDue,
} from '../../lib/api/reminders.js'
import { formatDuration, parseDuration } from '../../lib/duration.js'
import { CliError } from '../../lib/errors.js'
import { isQuiet } from '../../lib/global-args.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import { resolveTaskRef } from '../../lib/refs.js'
import { parseDateTime } from './helpers.js'

interface AddOptions {
    before?: string
    at?: string
    json?: boolean
    dryRun?: boolean
}

export async function addReminder(taskRef: string, options: AddOptions): Promise<void> {
    if (!options.before && !options.at) {
        throw new CliError('MISSING_TIME', 'Must specify --before or --at')
    }

    if (options.before && options.at) {
        throw new CliError('CONFLICTING_OPTIONS', 'Cannot use both --before and --at')
    }

    const api = await getApi()
    const task = await resolveTaskRef(api, taskRef)

    if (options.before) {
        const taskDue = task.due as { date?: string } | null
        if (!taskDue?.date) {
            throw new CliError('NO_DUE_DATE', 'Cannot use --before: task has no due date', [
                'Use --at to set a specific reminder time instead',
            ])
        }
        if (!taskDue.date.includes('T')) {
            throw new CliError(
                'NO_DUE_TIME',
                'Cannot use --before: task has a due date but no time',
                ['Use --at to set a specific reminder time, or add a time to the task'],
            )
        }
    }

    let minuteOffset: number | undefined
    let due: ReminderDue | undefined

    if (options.before) {
        const parsed = parseDuration(options.before)
        if (parsed === null) {
            throw new CliError('INVALID_DURATION', `Invalid duration format: "${options.before}"`, [
                'Examples: 30m, 1h, 2h15m, 1 hour 30 minutes',
            ])
        }
        minuteOffset = parsed
    }

    if (options.at) {
        due = parseDateTime(options.at)
    }

    if (options.dryRun) {
        printDryRun('add reminder', {
            Task: task.content,
            Before: options.before,
            At: options.at,
        })
        return
    }

    const reminderId = await apiAddReminder({
        itemId: task.id,
        minuteOffset,
        due,
    })

    if (options.json) {
        const reminder: Reminder = {
            id: reminderId,
            itemId: task.id,
            type: minuteOffset !== undefined ? 'relative' : 'absolute',
            minuteOffset,
            due,
            isDeleted: false,
        }
        console.log(formatJson(reminder, 'reminder'))
        return
    }

    if (isQuiet()) {
        console.log(reminderId)
        return
    }

    if (minuteOffset !== undefined) {
        console.log(`Added reminder: ${formatDuration(minuteOffset)} before due`)
    } else if (due) {
        console.log(`Added reminder: at ${due.date.replace('T', ' ')}`)
    }
    console.log(chalk.dim(`ID: ${reminderId}`))
}
