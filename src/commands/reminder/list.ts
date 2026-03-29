import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { getTaskReminders } from '../../lib/api/reminders.js'
import type { PaginatedViewOptions } from '../../lib/options.js'
import { formatPaginatedJson, formatPaginatedNdjson } from '../../lib/output.js'
import { resolveTaskRef } from '../../lib/refs.js'
import { formatReminderTime } from './helpers.js'

export async function listReminders(taskRef: string, options: PaginatedViewOptions): Promise<void> {
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
