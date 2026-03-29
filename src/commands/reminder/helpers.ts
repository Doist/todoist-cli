import type { Reminder, ReminderDue } from '../../lib/api/reminders.js'
import { formatDuration } from '../../lib/duration.js'
import { formatError } from '../../lib/output.js'

export function formatReminderTime(reminder: Reminder): string {
    if (reminder.minuteOffset != null) {
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

    throw new Error(
        formatError('INVALID_DATETIME', `Invalid datetime format: "${value}"`, [
            'Examples: 2024-01-15 10:00, 2024-01-15T10:00:00, 2024-01-15',
        ]),
    )
}
