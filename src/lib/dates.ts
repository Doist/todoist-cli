import { isBefore } from 'date-fns/isBefore'
import { isEqual } from 'date-fns/isEqual'
import { parseISO } from 'date-fns/parseISO'

export function getLocalDate(daysOffset = 0): string {
    const date = new Date()
    date.setDate(date.getDate() + daysOffset)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * Parse a due date string (handles both date-only and datetime formats)
 * and return a Date object set to start of day for date comparison
 */
export function parseDueDateToDay(dateStr: string): Date {
    const parsed = parseISO(dateStr)
    return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()))
}

/**
 * Check if a due date is on a specific day
 */
export function isDueOnDate(dueDate: string, targetDate: string): boolean {
    return isEqual(parseDueDateToDay(dueDate), parseDueDateToDay(targetDate))
}

/**
 * Check if a due date is before a specific day
 */
export function isDueBefore(dueDate: string, targetDate: string): boolean {
    return isBefore(parseDueDateToDay(dueDate), parseDueDateToDay(targetDate))
}

export function formatDateHeader(dateStr: string, today: string): string {
    if (isDueBefore(dateStr, today)) return 'Overdue'
    if (isDueOnDate(dateStr, today)) return 'Today'
    const tomorrow = getLocalDate(1)
    if (isDueOnDate(dateStr, tomorrow)) return 'Tomorrow'
    // Extract just the date part (YYYY-MM-DD) in case dateStr contains a time
    const dateOnly = dateStr.split('T')[0]
    const [year, month, day] = dateOnly.split('-').map(Number)
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
    })
}

const MINUTE_MS = 60_000

// The real range of UTC offsets, -12:00 to +14:00; anything wider is a typo such as +20:00 for +02:00.
const MIN_OFFSET_MINUTES = -12 * 60
const MAX_OFFSET_MINUTES = 14 * 60

const ISO_LOCAL =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?(Z|[+-]\d{2}:?\d{2})?$/i

/**
 * Parses `YYYY-MM-DD` or `YYYY-MM-DD[T ]HH:MM[:SS[.fraction]]` with an optional `Z` or `+HH:MM`
 * offset, which includes everything `Date.toISOString()` produces.
 * Without an offset the value is local time, date-only included (unlike `new Date('2026-10-20')`,
 * which is UTC). Returns `null` for anything else, including calendar dates that `Date` would
 * silently roll over such as `2026-02-30`.
 */
export function parseLocalDate(value: string): Date | null {
    const match = ISO_LOCAL.exec(value.trim())
    if (!match) return null
    const [, year, month, day, hour, minute, second, fraction, zone] = match
    if (hour === undefined && zone !== undefined) return null

    const [y, mo, d, h, mi, s] = [year, month, day, hour ?? '0', minute ?? '0', second ?? '0'].map(
        Number,
    )
    const ms = Number((fraction ?? '').padEnd(3, '0').slice(0, 3))
    if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || s > 59) return null

    if (zone === undefined) {
        const local = new Date(y, mo - 1, d, h, mi, s, ms)
        // `new Date(y, ...)` maps the years 0 to 99 to 1900 to 1999, and rolls an impossible day over.
        if (local.getFullYear() !== y || local.getMonth() !== mo - 1 || local.getDate() !== d) {
            return null
        }
        // A time typed inside a daylight-saving gap does not exist and `Date` shifts it to the next
        // hour. A date with no time is exempt: where midnight is skipped it is the first instant
        // of that day, which is what "until that day" means.
        const typedTimeExists =
            hour === undefined ||
            (local.getHours() === h && local.getMinutes() === mi && local.getSeconds() === s)
        return typedTimeExists ? local : null
    }

    const utc = new Date(Date.UTC(y, mo - 1, d, h, mi, s, ms))
    if (utc.getUTCFullYear() !== y || utc.getUTCMonth() !== mo - 1 || utc.getUTCDate() !== d) {
        return null
    }
    if (zone.toUpperCase() === 'Z') return utc
    const digits = zone.slice(1).replace(':', '')
    const offsetMinutes =
        (zone.startsWith('-') ? -1 : 1) *
        (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2)))
    if (
        Number(digits.slice(2)) > 59 ||
        offsetMinutes < MIN_OFFSET_MINUTES ||
        offsetMinutes > MAX_OFFSET_MINUTES
    ) {
        return null
    }
    return new Date(utc.getTime() - offsetMinutes * MINUTE_MS)
}

export function formatDateTime(date: Date): string {
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    })
}
