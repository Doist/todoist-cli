/**
 * Parse a duration string into minutes.
 * Supports formats like: "1h", "30m", "2h15m", "1 hour 30 minutes"
 * @returns minutes or null if invalid
 */
export function parseDuration(input: string): number | null {
    const normalized = input.trim().toLowerCase()
    if (!normalized) return null

    // Match all occurrences of number + unit
    // Units: h, hr, hrs, hour, hours, m, min, mins, minute, minutes
    const pattern = /(\d+)\s*(hours?|hrs?|h|minutes?|mins?|m)(?=\s|$|\d)/gi
    const matches = [...normalized.matchAll(pattern)]

    if (matches.length === 0) return null

    // Verify the entire input is consumed by valid duration parts
    // Remove all matched parts and whitespace, should be empty
    let remaining = normalized
    for (const match of matches) {
        remaining = remaining.replace(match[0], '')
    }
    remaining = remaining.replace(/\s+/g, '')
    if (remaining !== '') return null

    let totalMinutes = 0
    for (const match of matches) {
        const value = parseInt(match[1], 10)
        const unit = match[2].toLowerCase()

        if (unit.startsWith('h')) {
            totalMinutes += value * 60
        } else if (unit.startsWith('m')) {
            totalMinutes += value
        }
    }

    return totalMinutes
}

/**
 * Format a duration for display.
 * @param amount - the duration amount
 * @param unit - 'minute' or 'day'
 * @returns formatted string like "1h30m" or "2d"
 */
export function formatDuration(amount: number, unit: 'minute' | 'day' = 'minute'): string {
    const totalMinutes = unit === 'day' ? amount * 1440 : amount

    const days = Math.floor(totalMinutes / 1440)
    const hours = Math.floor((totalMinutes % 1440) / 60)
    const minutes = totalMinutes % 60

    const parts: string[] = []
    if (days > 0) parts.push(`${days}d`)
    if (hours > 0) parts.push(`${hours}h`)
    if (minutes > 0) parts.push(`${minutes}m`)

    return parts.length > 0 ? parts.join('') : '0m'
}
