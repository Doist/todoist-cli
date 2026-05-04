import {
    updateLocationReminder as apiUpdateLocationReminder,
    type UpdateLocationReminderArgs,
} from '../../../lib/api/reminders.js'
import { CliError } from '../../../lib/errors.js'
import { isQuiet } from '../../../lib/global-args.js'
import { formatJson, printDryRun } from '../../../lib/output.js'
import { lenientIdRef } from '../../../lib/refs.js'
import {
    formatLocationReminderRow,
    parseLat,
    parseLong,
    parseRadius,
    parseTrigger,
} from '../helpers.js'

interface UpdateOptions {
    name?: string
    lat?: string
    long?: string
    trigger?: string
    radius?: string
    json?: boolean
    dryRun?: boolean
}

export async function updateLocationReminderCmd(
    reminderId: string,
    options: UpdateOptions,
): Promise<void> {
    const id = lenientIdRef(reminderId, 'reminder')

    const args: UpdateLocationReminderArgs = {}
    if (options.name !== undefined) args.name = options.name
    if (options.lat !== undefined) args.locLat = parseLat(options.lat)
    if (options.long !== undefined) args.locLong = parseLong(options.long)
    if (options.trigger !== undefined) args.locTrigger = parseTrigger(options.trigger)
    if (options.radius !== undefined) args.radius = parseRadius(options.radius)

    if (Object.keys(args).length === 0) {
        throw new CliError('MISSING_UPDATE', 'Must specify at least one field to update', [
            'Available: --name, --lat, --long, --trigger, --radius',
        ])
    }

    if (options.dryRun) {
        printDryRun('update location reminder', {
            ID: id,
            Name: args.name,
            Lat: args.locLat,
            Long: args.locLong,
            Trigger: args.locTrigger,
            Radius: args.radius !== undefined ? `${args.radius}m` : undefined,
        })
        return
    }

    const reminder = await apiUpdateLocationReminder(id, args)

    if (options.json) {
        console.log(formatJson(reminder, 'location-reminder'))
        return
    }

    if (!isQuiet()) {
        console.log(`Updated location reminder: ${formatLocationReminderRow(reminder)} (id:${id})`)
    }
}
