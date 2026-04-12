import type { LocationReminder } from '@doist/todoist-sdk'
import chalk from 'chalk'
import { getLocationReminderById } from '../../../lib/api/reminders.js'
import { formatJson } from '../../../lib/output.js'
import { lenientIdRef } from '../../../lib/refs.js'
import { formatLocationReminderRow } from '../helpers.js'

interface GetOptions {
    json?: boolean
    full?: boolean
}

export async function getLocationReminderCmd(
    reminderId: string,
    options: GetOptions,
): Promise<void> {
    const id = lenientIdRef(reminderId, 'reminder')
    const reminder = (await getLocationReminderById(id)) as LocationReminder

    if (options.json) {
        console.log(formatJson(reminder, 'location-reminder', options.full))
        return
    }

    const idStr = chalk.dim(reminder.id)
    const type = chalk.magenta('[location]')
    console.log(`${idStr}  ${type} ${formatLocationReminderRow(reminder)}`)
    console.log(chalk.dim(`Task: ${reminder.itemId}`))
}
