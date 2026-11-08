import { parseDuration } from '../../lib/duration.js'
import { CliError } from '../../lib/errors.js'
import { stripLabelAtPrefix } from '../../lib/labels.js'

export type DurationArgs = { duration?: number; durationUnit?: 'minute' | 'day' }

// Parses a comma-separated --labels value into label names, stripping the
// display-only leading `@` from each (see stripLabelAtPrefix).
export function parseLabels(value: string): string[] {
    return normalizeLabels(value.split(','))
}

// Label names without the display-only leading `@`, dropping any left empty.
export function normalizeLabels(labels: readonly string[]): string[] {
    return labels.map((label) => stripLabelAtPrefix(label)).filter((label) => label.length > 0)
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
