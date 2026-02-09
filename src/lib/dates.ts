import { isBefore, isEqual, parseISO } from 'date-fns'

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
