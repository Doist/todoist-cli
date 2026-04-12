import type { LocationReminder, LocationTrigger, Reminder } from '@doist/todoist-sdk'
import type { ReminderDue } from '../../lib/api/reminders.js'
import { formatDuration } from '../../lib/duration.js'
import { CliError } from '../../lib/errors.js'

export type ReminderTypeFilter = 'time' | 'location'

interface ReminderLike {
    type: Reminder['type']
    minuteOffset?: number
    due?: { date: string }
}

export function formatReminderTime(reminder: ReminderLike): string {
    if (reminder.type === 'relative' && reminder.minuteOffset != null) {
        return `${formatDuration(reminder.minuteOffset)} before due`
    }
    if (reminder.due?.date) {
        const date = reminder.due.date
        if (date.includes('T')) {
            return `at ${date.replace('T', ' ').slice(0, 16)}`
        }
        return `at ${date}`
    }
    return 'unknown time'
}

export function formatLocationReminderRow(reminder: LocationReminder): string {
    const trigger = reminder.locTrigger === 'on_enter' ? 'on enter' : 'on leave'
    return `${reminder.name} (${trigger}) at ${reminder.locLat},${reminder.locLong} r=${reminder.radius}m`
}

export function parseDateTime(value: string): ReminderDue {
    const trimmed = value.trim()

    // ISO format: 2024-01-15T10:00:00
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) {
        return { date: trimmed }
    }

    // Space format: 2024-01-15 10:00
    const spaceMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/)
    if (spaceMatch) {
        return { date: `${spaceMatch[1]}T${spaceMatch[2]}:00` }
    }

    // Date only: 2024-01-15
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return { date: trimmed }
    }

    throw new CliError('INVALID_DATETIME', `Invalid datetime format: "${value}"`, [
        'Examples: 2024-01-15 10:00, 2024-01-15T10:00:00, 2024-01-15',
    ])
}

export function parseTrigger(value: string): LocationTrigger {
    if (value !== 'on_enter' && value !== 'on_leave') {
        throw new CliError('INVALID_TRIGGER', `Invalid trigger: "${value}"`, [
            'Must be one of: on_enter, on_leave',
        ])
    }
    return value
}

export function parseLat(value: string): string {
    const n = Number(value)
    if (!Number.isFinite(n) || n < -90 || n > 90) {
        throw new CliError('INVALID_LAT', `Invalid latitude: "${value}"`, [
            'Latitude must be a number between -90 and 90',
        ])
    }
    // Pass through the original string — the SDK expects a string
    return value
}

export function parseLong(value: string): string {
    const n = Number(value)
    if (!Number.isFinite(n) || n < -180 || n > 180) {
        throw new CliError('INVALID_LONG', `Invalid longitude: "${value}"`, [
            'Longitude must be a number between -180 and 180',
        ])
    }
    return value
}

export function parseRadius(value: string): number {
    const n = Number(value)
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
        throw new CliError('INVALID_RADIUS', `Invalid radius: "${value}"`, [
            'Radius must be a positive integer (meters)',
        ])
    }
    return n
}
