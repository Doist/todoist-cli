import { parseDuration } from '../../lib/duration.js'
import { CliError } from '../../lib/errors.js'

export type DurationArgs = { duration?: number; durationUnit?: 'minute' | 'day' }

export function validateFirstDueDate(
    firstDue: string | undefined,
    due: string | false | undefined,
): string | undefined {
    if (firstDue === undefined) return undefined

    if (due === false) {
        throw new CliError('CONFLICTING_OPTIONS', 'Cannot use --first-due and --no-due together.')
    }

    if (typeof due !== 'string' || !due.trim()) {
        throw new CliError('FIRST_DUE_REQUIRES_DUE', 'The --first-due flag requires --due.', [
            'Example: td task add "Task" --due "every 2 weeks" --first-due 2026-05-17',
        ])
    }

    const date = firstDue.trim()
    const parsed = new Date(`${date}T00:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime())) {
        throw new CliError('INVALID_FIRST_DUE', `Invalid first due date: "${firstDue}"`, [
            'Use YYYY-MM-DD (for example, 2026-05-17).',
        ])
    }

    if (parsed.toISOString().slice(0, 10) !== date) {
        throw new CliError('INVALID_FIRST_DUE', `Invalid first due date: "${firstDue}"`, [
            'Use a valid calendar date in YYYY-MM-DD format (for example, 2026-05-17).',
        ])
    }

    return date
}

export function applyDuration(args: DurationArgs, durationStr: string): void {
    const minutes = parseDuration(durationStr)
    if (minutes === null) {
        throw new CliError('INVALID_DURATION', `Invalid duration format: "${durationStr}"`, [
            'Examples: 30m, 1h, 2h15m, 1 hour 30 minutes',
        ])
    }
    args.duration = minutes
    args.durationUnit = 'minute'
}
