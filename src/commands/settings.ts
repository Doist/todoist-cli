import chalk from 'chalk'
import { Command } from 'commander'
import {
    fetchUserSettings,
    type UserSettings,
    updateUserSettings,
} from '../lib/api/user-settings.js'
import { formatError } from '../lib/output.js'

const DAY_NAMES: Record<number, string> = {
    1: 'Monday',
    2: 'Tuesday',
    3: 'Wednesday',
    4: 'Thursday',
    5: 'Friday',
    6: 'Saturday',
    7: 'Sunday',
}

const THEMES: { id: number; name: string; label: string; isPro: boolean }[] = [
    { id: 0, name: 'todoist', label: 'Todoist', isPro: false },
    { id: 11, name: 'dark', label: 'Dark', isPro: false },
    { id: 2, name: 'moonstone', label: 'Moonstone', isPro: false },
    { id: 3, name: 'tangerine', label: 'Tangerine', isPro: false },
    { id: 5, name: 'kale', label: 'Kale', isPro: true },
    { id: 6, name: 'blueberry', label: 'Blueberry', isPro: true },
    { id: 8, name: 'lavender', label: 'Lavender', isPro: true },
    { id: 12, name: 'raspberry', label: 'Raspberry', isPro: true },
]

function formatTheme(themeId: number): string {
    const theme = THEMES.find((t) => t.id === themeId)
    if (!theme) return String(themeId)
    return theme.isPro ? `${theme.label} (Pro)` : theme.label
}

function formatThemeList(): string {
    const lines = ['Available themes:']
    for (const theme of THEMES) {
        const pro = theme.isPro ? ' (Pro)' : ''
        lines.push(`  ${theme.name.padEnd(12)} ${theme.label}${pro}`)
    }
    return lines.join('\n')
}

function parseTheme(value: string): number {
    const v = value.toLowerCase()
    const theme = THEMES.find((t) => t.name === v || t.label.toLowerCase() === v)
    if (theme) return theme.id

    throw new Error(`Invalid theme: ${value}\n\n${formatThemeList()}`)
}

function getThemeName(themeId: number): string {
    const theme = THEMES.find((t) => t.id === themeId)
    return theme?.name ?? 'unknown'
}

function formatDay(day: number): string {
    return DAY_NAMES[day] ?? String(day)
}

function formatTimeFormat(format: number): string {
    return format === 0 ? '24h' : '12h'
}

function formatDateFormat(format: number): string {
    return format === 0 ? 'DD-MM-YYYY' : 'MM-DD-YYYY'
}

function formatAutoReminder(minutes: number): string {
    if (minutes === 0) return 'none'
    if (minutes < 60) return `${minutes} min`
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (mins === 0) return `${hours} hr`
    return `${hours} hr ${mins} min`
}

function formatBool(value: boolean): string {
    return value ? chalk.green('on') : chalk.dim('off')
}

function formatSettingsView(settings: UserSettings): string {
    const lines: string[] = []

    lines.push(chalk.bold('General'))
    lines.push(`  Timezone:       ${settings.timezone}`)
    lines.push(`  Time format:    ${formatTimeFormat(settings.timeFormat)}`)
    lines.push(`  Date format:    ${formatDateFormat(settings.dateFormat)}`)
    lines.push(`  Week starts:    ${formatDay(settings.startDay)}`)
    lines.push(`  Theme:          ${formatTheme(settings.theme)}`)
    lines.push(`  Auto reminder:  ${formatAutoReminder(settings.autoReminder)}`)
    lines.push(`  Next week:      ${formatDay(settings.nextWeek)}`)
    lines.push(`  Start page:     ${settings.startPage}`)
    lines.push('')
    lines.push(chalk.bold('Notifications'))
    lines.push(`  Push reminders:     ${formatBool(settings.reminderPush)}`)
    lines.push(`  Desktop reminders:  ${formatBool(settings.reminderDesktop)}`)
    lines.push(`  Email reminders:    ${formatBool(settings.reminderEmail)}`)
    lines.push(`  Desktop sound:      ${formatBool(settings.completedSoundDesktop)}`)
    lines.push(`  Mobile sound:       ${formatBool(settings.completedSoundMobile)}`)

    return lines.join('\n')
}

interface ViewOptions {
    json?: boolean
}

function formatSettingsForJson(settings: UserSettings): Record<string, unknown> {
    return {
        timezone: settings.timezone,
        timeFormat: settings.timeFormat === 0 ? '24h' : '12h',
        dateFormat: settings.dateFormat === 0 ? 'intl' : 'us',
        startDay: getDayName(settings.startDay),
        theme: getThemeName(settings.theme),
        autoReminder: settings.autoReminder,
        nextWeek: getDayName(settings.nextWeek),
        startPage: settings.startPage,
        reminderPush: settings.reminderPush,
        reminderDesktop: settings.reminderDesktop,
        reminderEmail: settings.reminderEmail,
        completedSoundDesktop: settings.completedSoundDesktop,
        completedSoundMobile: settings.completedSoundMobile,
    }
}

async function viewSettings(options: ViewOptions): Promise<void> {
    const settings = await fetchUserSettings()

    if (options.json) {
        console.log(JSON.stringify(formatSettingsForJson(settings), null, 2))
        return
    }

    console.log(formatSettingsView(settings))
}

function parseBoolean(value: string): boolean {
    const v = value.toLowerCase()
    if (v === 'true' || v === 'on' || v === '1' || v === 'yes') return true
    if (v === 'false' || v === 'off' || v === '0' || v === 'no') return false
    throw new Error(`Invalid boolean value: ${value}`)
}

function parseTimeFormat(value: string): number {
    if (value === '24' || value === '24h') return 0
    if (value === '12' || value === '12h') return 1
    throw new Error(`Invalid time format: ${value}. Use 12 or 24.`)
}

function parseDateFormat(value: string): number {
    const v = value.toLowerCase()
    if (v === 'intl' || v === 'dd-mm-yyyy' || v === 'dmy') return 0
    if (v === 'us' || v === 'mm-dd-yyyy' || v === 'mdy') return 1
    throw new Error(`Invalid date format: ${value}. Use us or intl.`)
}

const DAY_MAP: Record<string, number> = {
    monday: 1,
    mon: 1,
    tuesday: 2,
    tue: 2,
    wednesday: 3,
    wed: 3,
    thursday: 4,
    thu: 4,
    friday: 5,
    fri: 5,
    saturday: 6,
    sat: 6,
    sunday: 7,
    sun: 7,
}

function parseDay(value: string): number {
    const day = DAY_MAP[value.toLowerCase()]
    if (day !== undefined) return day

    throw new Error(
        `Invalid day: ${value}. Use: monday, tuesday, wednesday, thursday, friday, saturday, sunday (or mon, tue, etc.)`,
    )
}

function getDayName(day: number): string {
    return DAY_NAMES[day]?.toLowerCase() ?? 'unknown'
}

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

async function update(options: UpdateOptions): Promise<void> {
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

export function registerSettingsCommand(program: Command): void {
    const settings = program.command('settings').description('Manage user settings')

    settings
        .command('view')
        .description('View current settings')
        .option('--json', 'Output as JSON')
        .action(viewSettings)

    settings
        .command('update')
        .description('Update settings')
        .option('--timezone <tz>', 'Timezone (e.g., UTC, Europe/London)')
        .option('--time-format <format>', 'Time format: 12 or 24')
        .option('--date-format <format>', 'Date format: us (MM-DD) or intl (DD-MM)')
        .option('--start-day <day>', 'Week start: monday, tuesday, etc.')
        .option('--theme <name>', 'Theme: todoist, dark, moonstone, tangerine, etc.')
        .option('--auto-reminder <min>', 'Default reminder minutes (0 to disable)')
        .option('--next-week <day>', '"Next week" day: monday, tuesday, etc.')
        .option('--start-page <page>', 'Default view: inbox, today, or project URL')
        .option('--reminder-push <bool>', 'Push reminders: on/off')
        .option('--reminder-desktop <bool>', 'Desktop reminders: on/off')
        .option('--reminder-email <bool>', 'Email reminders: on/off')
        .option('--completed-sound-desktop <bool>', 'Desktop completion sound: on/off')
        .option('--completed-sound-mobile <bool>', 'Mobile completion sound: on/off')
        .action(async (options: UpdateOptions, command: Command) => {
            const hasOptions = Object.values(options).some((v) => v !== undefined)
            if (!hasOptions) {
                command.help()
                return
            }
            await update(options)
        })

    settings
        .command('themes')
        .description('List available themes')
        .action(() => {
            console.log(formatThemeList())
        })
}
