import { format, isBefore, isEqual, parseISO } from 'date-fns'

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
    // Parse the date string (handles both YYYY-MM-DD and YYYY-MM-DDTHH:mm:ss formats)
    const parsed = parseISO(dateStr)
    // Return start of day to compare only dates, not times
    return parseISO(format(parsed, 'yyyy-MM-dd'))
}

/**
 * Check if a due date is on a specific day
 */
export function isDueOnDate(dueDate: string, targetDate: string): boolean {
    return isEqual(parseDueDateToDay(dueDate), parseISO(targetDate))
}

/**
 * Check if a due date is before a specific day
 */
export function isDueBefore(dueDate: string, targetDate: string): boolean {
    return isBefore(parseDueDateToDay(dueDate), parseISO(targetDate))
}

export function formatDateHeader(dateStr: string, today: string): string {
    if (isDueBefore(dateStr, today)) return 'Overdue'
    if (isDueOnDate(dateStr, today)) return 'Today'
    const tomorrow = getLocalDate(1)
    if (isDueOnDate(dateStr, tomorrow)) return 'Tomorrow'
    const [year, month, day] = dateStr.split('-').map(Number)
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
    })
}
