import { createCommand } from '@doist/todoist-api-typescript'
import { getApi, pickDefined } from './core.js'

export interface UserSettings {
    timezone: string
    timeFormat: number // 0=24h, 1=12h
    dateFormat: number // 0=DD-MM-YYYY, 1=MM-DD-YYYY
    startDay: number // 1-7 (1=Mon, 7=Sun)
    theme: number // 0-10
    autoReminder: number // minutes before due
    nextWeek: number // 1-7
    startPage: string
    reminderPush: boolean
    reminderDesktop: boolean
    reminderEmail: boolean
    completedSoundDesktop: boolean
    completedSoundMobile: boolean
}

export async function fetchUserSettings(): Promise<UserSettings> {
    const api = await getApi()
    const response = await api.sync({
        resourceTypes: ['user', 'user_settings'],
        syncToken: '*',
    })

    const user = response.user
    const settings = response.userSettings

    return {
        timezone: user?.tzInfo?.timezone ?? 'UTC',
        timeFormat: user?.timeFormat ?? 0,
        dateFormat: user?.dateFormat ?? 0,
        startDay: user?.startDay ?? 1,
        theme: Number(user?.themeId ?? 0),
        autoReminder: user?.autoReminder ?? 0,
        nextWeek: user?.nextWeek ?? 1,
        startPage: user?.startPage ?? 'today',
        reminderPush: settings?.reminderPush ?? true,
        reminderDesktop: settings?.reminderDesktop ?? true,
        reminderEmail: settings?.reminderEmail ?? false,
        completedSoundDesktop: settings?.completedSoundDesktop ?? true,
        completedSoundMobile: settings?.completedSoundMobile ?? true,
    }
}

export interface UpdateUserSettingsArgs {
    timezone?: string
    timeFormat?: number
    dateFormat?: number
    startDay?: number
    theme?: number
    autoReminder?: number
    nextWeek?: number
    startPage?: string
    reminderPush?: boolean
    reminderDesktop?: boolean
    reminderEmail?: boolean
    completedSoundDesktop?: boolean
    completedSoundMobile?: boolean
}

export async function updateUserSettings(args: UpdateUserSettingsArgs): Promise<void> {
    const commands = []

    const userArgs = pickDefined({
        timezone: args.timezone,
        time_format: args.timeFormat,
        date_format: args.dateFormat,
        start_day: args.startDay,
        theme_id: args.theme !== undefined ? String(args.theme) : undefined,
        auto_reminder: args.autoReminder,
        next_week: args.nextWeek,
        start_page: args.startPage,
    })

    if (Object.keys(userArgs).length > 0) {
        commands.push(createCommand('user_update', userArgs))
    }

    const settingsArgs = pickDefined({
        reminderPush: args.reminderPush,
        reminderDesktop: args.reminderDesktop,
        reminderEmail: args.reminderEmail,
        completedSoundDesktop: args.completedSoundDesktop,
        completedSoundMobile: args.completedSoundMobile,
    })

    if (Object.keys(settingsArgs).length > 0) {
        commands.push(createCommand('user_settings_update', settingsArgs))
    }

    if (commands.length === 0) {
        throw new Error('No settings to update')
    }

    const api = await getApi()
    await api.sync({ commands })
}
