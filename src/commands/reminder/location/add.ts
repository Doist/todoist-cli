import chalk from 'chalk'
import { getApi } from '../../../lib/api/core.js'
import { addLocationReminder as apiAddLocationReminder } from '../../../lib/api/reminders.js'
import { CliError } from '../../../lib/errors.js'
import { isQuiet } from '../../../lib/global-args.js'
import { formatJson, printDryRun } from '../../../lib/output.js'
import { resolveTaskRef } from '../../../lib/refs.js'
import {
    formatLocationReminderRow,
    parseLat,
    parseLong,
    parseRadius,
    parseTrigger,
} from '../helpers.js'

interface AddOptions {
    name?: string
    lat?: string
    long?: string
    trigger?: string
    radius?: string
    json?: boolean
    dryRun?: boolean
}

export async function addLocationReminderCmd(taskRef: string, options: AddOptions): Promise<void> {
    if (!options.name) {
        throw new CliError('MISSING_NAME', 'Must specify --name')
    }
    if (!options.lat) {
        throw new CliError('MISSING_LAT', 'Must specify --lat')
    }
    if (!options.long) {
        throw new CliError('MISSING_LONG', 'Must specify --long')
    }
    if (!options.trigger) {
        throw new CliError('MISSING_TRIGGER', 'Must specify --trigger', [
            'Use --trigger on_enter or --trigger on_leave',
        ])
    }

    const lat = parseLat(options.lat)
    const long = parseLong(options.long)
    const trigger = parseTrigger(options.trigger)
    const radius = options.radius !== undefined ? parseRadius(options.radius) : undefined

    const api = await getApi()
    const task = await resolveTaskRef(api, taskRef)

    if (options.dryRun) {
        printDryRun('add location reminder', {
            Task: task.content,
            Name: options.name,
            Lat: lat,
            Long: long,
            Trigger: trigger,
            Radius: radius !== undefined ? `${radius}m` : undefined,
        })
        return
    }

    const reminder = await apiAddLocationReminder({
        taskId: task.id,
        name: options.name,
        locLat: lat,
        locLong: long,
        locTrigger: trigger,
        radius,
    })

    if (options.json) {
        console.log(formatJson(reminder, 'location-reminder'))
        return
    }

    if (isQuiet()) {
        console.log(reminder.id)
        return
    }

    console.log(`Added location reminder: ${formatLocationReminderRow(reminder)}`)
    console.log(chalk.dim(`ID: ${reminder.id}`))
}
