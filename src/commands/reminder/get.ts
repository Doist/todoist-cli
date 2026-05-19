import type { Reminder as SdkReminder } from '@doist/todoist-sdk'
import chalk from 'chalk'
import { getReminderById } from '../../lib/api/reminders.js'
import { formatJson } from '../../lib/output.js'
import { lenientIdRef } from '../../lib/refs.js'
import { formatReminderTime, formatUrgentBadge } from './helpers.js'

interface GetOptions {
    json?: boolean
    full?: boolean
}

// `td reminder get` targets the time-reminder endpoint, so location is impossible here.
type TimeReminder = Extract<SdkReminder, { type: 'absolute' | 'relative' }>

export async function getReminderCmd(reminderId: string, options: GetOptions): Promise<void> {
    const id = lenientIdRef(reminderId, 'reminder')
    const reminder = (await getReminderById(id)) as TimeReminder

    if (options.json) {
        console.log(formatJson(reminder, 'reminder', options.full))
        return
    }

    const idStr = chalk.dim(reminder.id)
    const type = chalk.cyan('[time]')
    const time = formatReminderTime(reminder)
    const urgent = formatUrgentBadge(reminder.isUrgent)
    const urgentSegment = urgent ? ` ${urgent}` : ''
    console.log(`${idStr}  ${type}${urgentSegment} ${time}`)
    console.log(chalk.dim(`Task: ${reminder.itemId}`))
}
