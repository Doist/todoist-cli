import type { DateFormat, DayOfWeek, TimeFormat } from '@doist/todoist-api-typescript'
import chalk from 'chalk'
import { Option } from 'commander'
import type { UserSettings } from '../../lib/api/user-settings.js'
import { withUnvalidatedChoices } from '../../lib/completion.js'

export const THEMES: { id: number; name: string; label: string; isPro: boolean }[] = [
    { id: 0, name: 'todoist', label: 'Todoist', isPro: false },
    { id: 11, name: 'dark', label: 'Dark', isPro: false },
    { id: 2, name: 'moonstone', label: 'Moonstone', isPro: false },
    { id: 3, name: 'tangerine', label: 'Tangerine', isPro: false },
    { id: 5, name: 'kale', label: 'Kale', isPro: true },
    { id: 6, name: 'blueberry', label: 'Blueberry', isPro: true },
    { id: 8, name: 'lavender', label: 'Lavender', isPro: true },
    { id: 12, name: 'raspberry', label: 'Raspberry', isPro: true },
]

/** CLI value → TimeFormat string */
const TIME_FORMAT_MAP: Record<string, TimeFormat> = {
    '12': '12h',
    '12h': '12h',
    '24': '24h',
    '24h': '24h',
}

/** CLI value → DateFormat string */
const DATE_FORMAT_MAP: Record<string, DateFormat> = {
    us: 'MM/DD/YYYY',
    'mm-dd-yyyy': 'MM/DD/YYYY',
    mdy: 'MM/DD/YYYY',
    intl: 'DD/MM/YYYY',
    'dd-mm-yyyy': 'DD/MM/YYYY',
    dmy: 'DD/MM/YYYY',
}

/** CLI value → DayOfWeek string */
const DAY_MAP: Record<string, DayOfWeek> = {
    monday: 'Monday',
    mon: 'Monday',
    tuesday: 'Tuesday',
    tue: 'Tuesday',
    wednesday: 'Wednesday',
    wed: 'Wednesday',
    thursday: 'Thursday',
    thu: 'Thursday',
    friday: 'Friday',
    fri: 'Friday',
    saturday: 'Saturday',
    sat: 'Saturday',
    sunday: 'Sunday',
    sun: 'Sunday',
}

export const TIME_FORMAT_CHOICES = Object.keys(TIME_FORMAT_MAP)
export const DATE_FORMAT_CHOICES = Object.keys(DATE_FORMAT_MAP)
export const DAY_CHOICES = Object.keys(DAY_MAP)
export const THEME_CHOICES = THEMES.map((t) => t.name)

export function parseTheme(value: string): number {
    const theme = THEMES.find((t) => t.name === value)
    if (theme) return theme.id
    throw new Error(`Invalid theme: "${value}"`)
}

export function parseTimeFormat(value: string): TimeFormat {
    const result = TIME_FORMAT_MAP[value]
    if (result !== undefined) return result
    throw new Error(`Invalid time format: "${value}"`)
}

export function parseDateFormat(value: string): DateFormat {
    const result = DATE_FORMAT_MAP[value.toLowerCase()]
    if (result !== undefined) return result
    throw new Error(`Invalid date format: "${value}"`)
}

export function parseDay(value: string): DayOfWeek {
    const result = DAY_MAP[value.toLowerCase()]
    if (result !== undefined) return result
    throw new Error(`Invalid day: "${value}"`)
}

export function formatTheme(themeId: number): string {
    const theme = THEMES.find((t) => t.id === themeId)
    if (!theme) return String(themeId)
    return theme.isPro ? `${theme.label} (Pro)` : theme.label
}

export function formatThemeList(): string {
    const lines = ['Available themes:']
    for (const theme of THEMES) {
        const pro = theme.isPro ? ' (Pro)' : ''
        lines.push(`  ${theme.name.padEnd(12)} ${theme.label}${pro}`)
    }
    return lines.join('\n')
}

export function getThemeName(themeId: number): string {
    const theme = THEMES.find((t) => t.id === themeId)
    return theme?.name ?? 'unknown'
}

function formatDay(day: DayOfWeek): string {
    return day
}

function formatTimeFormat(format: TimeFormat): string {
    return format
}

function formatDateFormat(format: DateFormat): string {
    return format
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

export function formatSettingsView(settings: UserSettings, startPageName: string | null): string {
    const lines: string[] = []

    lines.push(chalk.bold('General'))
    lines.push(`  Timezone:       ${settings.timezone}`)
    lines.push(`  Time format:    ${formatTimeFormat(settings.timeFormat)}`)
    lines.push(`  Date format:    ${formatDateFormat(settings.dateFormat)}`)
    lines.push(`  Week starts:    ${formatDay(settings.startDay)}`)
    lines.push(`  Theme:          ${formatTheme(settings.theme)}`)
    lines.push(`  Auto reminder:  ${formatAutoReminder(settings.autoReminder)}`)
    lines.push(`  Next week:      ${formatDay(settings.nextWeek)}`)
    const startPageDisplay = startPageName
        ? `${settings.startPage} (${startPageName})`
        : settings.startPage
    lines.push(`  Start page:     ${startPageDisplay}`)
    lines.push('')
    lines.push(chalk.bold('Notifications'))
    lines.push(`  Push reminders:     ${formatBool(settings.reminderPush)}`)
    lines.push(`  Desktop reminders:  ${formatBool(settings.reminderDesktop)}`)
    lines.push(`  Email reminders:    ${formatBool(settings.reminderEmail)}`)
    lines.push(`  Desktop sound:      ${formatBool(settings.completedSoundDesktop)}`)
    lines.push(`  Mobile sound:       ${formatBool(settings.completedSoundMobile)}`)

    return lines.join('\n')
}

export function formatSettingsForJson(
    settings: UserSettings,
    startPageName: string | null,
): Record<string, unknown> {
    return {
        timezone: settings.timezone,
        timeFormat: settings.timeFormat,
        dateFormat: settings.dateFormat === 'DD/MM/YYYY' ? 'intl' : 'us',
        startDay: settings.startDay.toLowerCase(),
        theme: getThemeName(settings.theme),
        autoReminder: settings.autoReminder,
        nextWeek: settings.nextWeek.toLowerCase(),
        startPage: settings.startPage,
        startPageName,
        reminderPush: settings.reminderPush,
        reminderDesktop: settings.reminderDesktop,
        reminderEmail: settings.reminderEmail,
        completedSoundDesktop: settings.completedSoundDesktop,
        completedSoundMobile: settings.completedSoundMobile,
    }
}

export function parseBoolean(value: string): boolean {
    const v = value.toLowerCase()
    if (v === 'true' || v === 'on' || v === '1' || v === 'yes') return true
    if (v === 'false' || v === 'off' || v === '0' || v === 'no') return false
    throw new Error(`Invalid boolean value: ${value}`)
}

export function parseStartPageRef(
    startPage: string,
): { type: 'project' | 'filter' | 'label'; id: string } | null {
    const match = startPage.match(/^(project|filter|label)\?id=(.+)$/)
    if (!match) return null
    return { type: match[1] as 'project' | 'filter' | 'label', id: match[2] }
}

export function boolOption(flags: string, description: string): Option {
    return withUnvalidatedChoices(new Option(flags, description), [
        'on',
        'off',
        'true',
        'false',
        'yes',
        'no',
        '1',
        '0',
    ])
}
