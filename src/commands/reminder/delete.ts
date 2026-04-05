import { deleteReminder as apiDeleteReminder, fetchReminders } from '../../lib/api/reminders.js'
import { isQuiet } from '../../lib/global-args.js'
import { formatError, printDryRun } from '../../lib/output.js'
import { lenientIdRef } from '../../lib/refs.js'
import { formatReminderTime } from './helpers.js'

interface DeleteOptions {
    yes?: boolean
    dryRun?: boolean
}

export async function deleteReminderCmd(reminderId: string, options: DeleteOptions): Promise<void> {
    const id = lenientIdRef(reminderId, 'reminder')

    const reminders = await fetchReminders()
    const reminder = reminders.find((r) => r.id === id)

    if (!reminder) {
        console.log(formatError('NOT_FOUND', `Reminder not found: ${id}`))
        process.exitCode = 1
        return
    }

    const timeDesc = formatReminderTime(reminder)

    if (options.dryRun) {
        printDryRun('delete reminder', { Reminder: timeDesc })
        return
    }

    if (!options.yes) {
        console.log(`Would delete reminder: ${timeDesc}`)
        console.log('Use --yes to confirm.')
        return
    }

    await apiDeleteReminder(id)
    if (!isQuiet()) console.log(`Deleted reminder: ${timeDesc} (id:${id})`)
}
