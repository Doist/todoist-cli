import { updateReminder as apiUpdateReminder, type ReminderDue } from '../../lib/api/reminders.js'
import { formatDuration, parseDuration } from '../../lib/duration.js'
import { CliError } from '../../lib/errors.js'
import { isQuiet } from '../../lib/global-args.js'
import { printDryRun } from '../../lib/output.js'
import { lenientIdRef } from '../../lib/refs.js'
import { parseDateTime } from './helpers.js'

interface UpdateOptions {
    before?: string
    at?: string
    dryRun?: boolean
}

export async function updateReminderCmd(reminderId: string, options: UpdateOptions): Promise<void> {
    if (!options.before && !options.at) {
        throw new CliError('MISSING_TIME', 'Must specify --before or --at')
    }

    if (options.before && options.at) {
        throw new CliError('CONFLICTING_OPTIONS', 'Cannot use both --before and --at')
    }

    const id = lenientIdRef(reminderId, 'reminder')

    if (options.dryRun) {
        printDryRun('update reminder', {
            ID: id,
            Before: options.before,
            At: options.at,
        })
        return
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

    await apiUpdateReminder(id, { minuteOffset, due })

    if (!isQuiet()) {
        if (minuteOffset !== undefined) {
            console.log(`Updated reminder: ${formatDuration(minuteOffset)} before due (id:${id})`)
        } else if (due) {
            console.log(`Updated reminder: at ${due.date.replace('T', ' ')} (id:${id})`)
        }
    }
}
