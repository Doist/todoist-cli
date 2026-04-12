import {
    deleteLocationReminder as apiDeleteLocationReminder,
    getLocationReminderById,
} from '../../../lib/api/reminders.js'
import { isQuiet } from '../../../lib/global-args.js'
import { printDryRun } from '../../../lib/output.js'
import { lenientIdRef } from '../../../lib/refs.js'
import { formatLocationReminderRow } from '../helpers.js'

interface DeleteOptions {
    yes?: boolean
    dryRun?: boolean
}

export async function deleteLocationReminderCmd(
    reminderId: string,
    options: DeleteOptions,
): Promise<void> {
    const id = lenientIdRef(reminderId, 'reminder')

    const reminder = await getLocationReminderById(id)
    const detail = formatLocationReminderRow(reminder)

    if (options.dryRun) {
        printDryRun('delete location reminder', { Reminder: detail })
        return
    }

    if (!options.yes) {
        console.log(`Would delete location reminder: ${detail}`)
        console.log('Use --yes to confirm.')
        return
    }

    await apiDeleteLocationReminder(id)
    if (!isQuiet()) console.log(`Deleted location reminder: ${detail} (id:${id})`)
}
