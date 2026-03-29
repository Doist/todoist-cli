import type { LocationReminder } from '@doist/todoist-api-typescript'
import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import type { PaginatedViewOptions } from '../../lib/options.js'
import { formatPaginatedJson, formatPaginatedNdjson } from '../../lib/output.js'
import { paginate } from '../../lib/pagination.js'
import { resolveTaskRef } from '../../lib/refs.js'
import { formatLocationReminderRow, formatReminderTime } from './helpers.js'

interface ListOptions extends PaginatedViewOptions {
    task?: string
    limit?: string
    cursor?: string
    all?: boolean
}

export async function listReminders(
    taskRef: string | undefined,
    options: ListOptions,
): Promise<void> {
    const api = await getApi()

    let taskId: string | undefined
    if (taskRef) {
        const task = await resolveTaskRef(api, taskRef)
        taskId = task.id
    }

    const targetLimit = options.all
        ? Number.MAX_SAFE_INTEGER
        : options.limit
          ? parseInt(options.limit, 10)
          : 200

    const args = (taskId ? { taskId } : {})

    // Fetch time-based and location-based reminders in parallel
    const [timeResult, locationResult] = await Promise.all([
        paginate(
            async (cursor, limit) => {
                const resp = await api.getReminders({ ...args, cursor, limit })
                return { results: resp.results, nextCursor: resp.nextCursor }
            },
            { limit: targetLimit, startCursor: options.cursor },
        ),
        paginate(
            async (cursor, limit) => {
                const resp = await api.getLocationReminders({ ...args, cursor, limit })
                return { results: resp.results, nextCursor: resp.nextCursor }
            },
            { limit: targetLimit, startCursor: options.cursor },
        ),
    ])

    const reminders = timeResult.results
    const locationReminders = locationResult.results
    const nextCursor = timeResult.nextCursor || locationResult.nextCursor

    if (options.json) {
        const timeJson = formatPaginatedJson(
            { results: reminders, nextCursor: timeResult.nextCursor },
            'reminder',
            options.full,
        )
        const locationJson = formatPaginatedJson(
            { results: locationReminders, nextCursor: locationResult.nextCursor },
            'location-reminder',
            options.full,
        )
        const timeParsed = JSON.parse(timeJson)
        const locationParsed = JSON.parse(locationJson)
        console.log(
            JSON.stringify(
                {
                    reminders: timeParsed.results,
                    locationReminders: locationParsed.results,
                    nextCursor,
                },
                null,
                2,
            ),
        )
        return
    }

    if (options.ndjson) {
        const timeNdjson = formatPaginatedNdjson(
            { results: reminders, nextCursor: timeResult.nextCursor },
            'reminder',
            options.full,
        )
        const locationNdjson = formatPaginatedNdjson(
            { results: locationReminders, nextCursor: locationResult.nextCursor },
            'location-reminder',
            options.full,
        )
        const parts = [timeNdjson, locationNdjson].filter(Boolean)
        if (parts.length > 0) {
            console.log(parts.join('\n'))
        }
        return
    }

    if (reminders.length === 0 && locationReminders.length === 0) {
        console.log('No reminders.')
        return
    }

    for (const reminder of reminders) {
        const id = chalk.dim(reminder.id)
        const type = chalk.cyan('[time]')
        const time = formatReminderTime(reminder)
        console.log(`${id}  ${type} ${time}`)
    }

    for (const loc of locationReminders) {
        const id = chalk.dim(loc.id)
        const type = chalk.magenta('[location]')
        const detail = formatLocationReminderRow(loc as LocationReminder)
        console.log(`${id}  ${type} ${detail}`)
    }
}
