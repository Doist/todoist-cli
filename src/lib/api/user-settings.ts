import { getApiToken } from '../auth.js'
import { executeSyncCommand, generateUuid, type SyncCommand } from './core.js'

interface UserSettingsSyncResponse {
    user?: Record<string, unknown>
    user_settings?: Record<string, unknown>
    error?: string
}

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
    const token = await getApiToken()
    const response = await fetch('https://api.todoist.com/api/v1/sync', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            sync_token: '*',
            resource_types: '["user","user_settings"]',
        }),
    })

    if (!response.ok) {
        throw new Error(`Failed to fetch user settings: ${response.status}`)
    }

    const data: UserSettingsSyncResponse = await response.json()
    if (data.error) {
        throw new Error(`User settings API error: ${data.error}`)
    }

    const user = data.user ?? {}
    const settings = data.user_settings ?? {}

    return {
        timezone: String(user.timezone ?? 'UTC'),
        timeFormat: Number(user.time_format ?? 0),
        dateFormat: Number(user.date_format ?? 0),
        startDay: Number(user.start_day ?? 1),
        theme: Number(user.theme_id ?? user.theme ?? 0),
        autoReminder: Number(user.auto_reminder ?? 0),
        nextWeek: Number(user.next_week ?? 1),
        startPage: String(user.start_page ?? 'today'),
        reminderPush: Boolean(settings.reminder_push ?? true),
        reminderDesktop: Boolean(settings.reminder_desktop ?? true),
        reminderEmail: Boolean(settings.reminder_email ?? false),
        completedSoundDesktop: Boolean(settings.completed_sound_desktop ?? true),
        completedSoundMobile: Boolean(settings.completed_sound_mobile ?? true),
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
    const commands: SyncCommand[] = []

    const userArgs: Record<string, unknown> = {}
    if (args.timezone !== undefined) userArgs.timezone = args.timezone
    if (args.timeFormat !== undefined) userArgs.time_format = args.timeFormat
    if (args.dateFormat !== undefined) userArgs.date_format = args.dateFormat
    if (args.startDay !== undefined) userArgs.start_day = args.startDay
    if (args.theme !== undefined) userArgs.theme_id = String(args.theme)
    if (args.autoReminder !== undefined) userArgs.auto_reminder = args.autoReminder
    if (args.nextWeek !== undefined) userArgs.next_week = args.nextWeek
    if (args.startPage !== undefined) userArgs.start_page = args.startPage

    if (Object.keys(userArgs).length > 0) {
        commands.push({
            type: 'user_update',
            uuid: generateUuid(),
            args: userArgs,
        })
    }

    const settingsArgs: Record<string, unknown> = {}
    if (args.reminderPush !== undefined) settingsArgs.reminder_push = args.reminderPush
    if (args.reminderDesktop !== undefined) settingsArgs.reminder_desktop = args.reminderDesktop
    if (args.reminderEmail !== undefined) settingsArgs.reminder_email = args.reminderEmail
    if (args.completedSoundDesktop !== undefined)
        settingsArgs.completed_sound_desktop = args.completedSoundDesktop
    if (args.completedSoundMobile !== undefined)
        settingsArgs.completed_sound_mobile = args.completedSoundMobile

    if (Object.keys(settingsArgs).length > 0) {
        commands.push({
            type: 'user_settings_update',
            uuid: generateUuid(),
            args: settingsArgs,
        })
    }

    if (commands.length === 0) {
        throw new Error('No settings to update')
    }

    await executeSyncCommand(commands)
}
