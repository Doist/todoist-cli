import { updateUserSettings } from '../../lib/api/user-settings.js'
import { formatError } from '../../lib/output.js'
import { parseBoolean, parseDateFormat, parseDay, parseTheme, parseTimeFormat } from './helpers.js'

interface UpdateOptions {
    timezone?: string
    timeFormat?: string
    dateFormat?: string
    startDay?: string
    theme?: string
    autoReminder?: string
    nextWeek?: string
    startPage?: string
    reminderPush?: string
    reminderDesktop?: string
    reminderEmail?: string
    completedSoundDesktop?: string
    completedSoundMobile?: string
}

export async function updateSettings(options: UpdateOptions): Promise<void> {
    const args: Parameters<typeof updateUserSettings>[0] = {}

    if (options.timezone !== undefined) {
        args.timezone = options.timezone
    }
    if (options.timeFormat !== undefined) {
        args.timeFormat = parseTimeFormat(options.timeFormat)
    }
    if (options.dateFormat !== undefined) {
        args.dateFormat = parseDateFormat(options.dateFormat)
    }
    if (options.startDay !== undefined) {
        args.startDay = parseDay(options.startDay)
    }
    if (options.theme !== undefined) {
        args.theme = parseTheme(options.theme)
    }
    if (options.autoReminder !== undefined) {
        const minutes = parseInt(options.autoReminder, 10)
        if (Number.isNaN(minutes) || minutes < 0) {
            throw new Error(
                formatError('INVALID_AUTO_REMINDER', 'Auto reminder must be >= 0 minutes.'),
            )
        }
        args.autoReminder = minutes
    }
    if (options.nextWeek !== undefined) {
        args.nextWeek = parseDay(options.nextWeek)
    }
    if (options.startPage !== undefined) {
        args.startPage = options.startPage
    }
    if (options.reminderPush !== undefined) {
        args.reminderPush = parseBoolean(options.reminderPush)
    }
    if (options.reminderDesktop !== undefined) {
        args.reminderDesktop = parseBoolean(options.reminderDesktop)
    }
    if (options.reminderEmail !== undefined) {
        args.reminderEmail = parseBoolean(options.reminderEmail)
    }
    if (options.completedSoundDesktop !== undefined) {
        args.completedSoundDesktop = parseBoolean(options.completedSoundDesktop)
    }
    if (options.completedSoundMobile !== undefined) {
        args.completedSoundMobile = parseBoolean(options.completedSoundMobile)
    }

    await updateUserSettings(args)
    console.log('Settings updated.')
}
