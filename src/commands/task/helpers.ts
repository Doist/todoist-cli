import { parseDuration } from '../../lib/duration.js'
import { formatError } from '../../lib/output.js'

export type DurationArgs = { duration?: number; durationUnit?: 'minute' | 'day' }

export function applyDuration(args: DurationArgs, durationStr: string): void {
    const minutes = parseDuration(durationStr)
    if (minutes === null) {
        throw new Error(
            formatError('INVALID_DURATION', `Invalid duration format: "${durationStr}"`, [
                'Examples: 30m, 1h, 2h15m, 1 hour 30 minutes',
            ]),
        )
    }
    args.duration = minutes
    args.durationUnit = 'minute'
}
