import chalk from 'chalk'
import { getReminderById } from '../../lib/api/reminders.js'
import { formatJson } from '../../lib/output.js'
import { lenientIdRef } from '../../lib/refs.js'
import { formatReminderTime } from './helpers.js'

interface GetOptions {
    json?: boolean
    full?: boolean
}

export async function getReminderCmd(reminderId: string, options: GetOptions): Promise<void> {
    const id = lenientIdRef(reminderId, 'reminder')
    const reminder = await getReminderById(id)

    if (options.json) {
        console.log(formatJson(reminder, 'reminder', options.full))
        return
    }

    const idStr = chalk.dim(reminder.id)
    const type = chalk.cyan('[time]')
    const time = formatReminderTime(
        reminder as {
            type: 'relative' | 'absolute'
            minuteOffset?: number
            due?: { date: string }
        },
    )
    console.log(`${idStr}  ${type} ${time}`)
    console.log(chalk.dim(`Task: ${reminder.itemId}`))
}
