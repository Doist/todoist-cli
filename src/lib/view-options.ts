import {
    GROUPED_BY_OPTIONS,
    SORT_ORDERS,
    SORTED_BY_OPTIONS,
    VIEW_MODES,
    type GroupedBy,
    type SortOrder,
    type SortedBy,
    type ViewMode,
} from '@doist/todoist-sdk'
import { CliError } from './errors.js'

/**
 * The Sync API expects these enums in UPPERCASE (`BOARD`, `ASSIGNEE`, ...), and
 * rejects anything else with `error_code: 20`. Users type lowercase and kebab-case
 * on the command line, so normalize before sending: `due-date` -> `DUE_DATE`.
 */
function normalize(value: string): string {
    return value.trim().toUpperCase().replaceAll('-', '_')
}

function parseEnum<T extends string>(value: string, allowed: readonly T[], option: string): T {
    const normalized = normalize(value)
    const match = allowed.find((a) => a === normalized)
    if (!match) {
        throw new CliError('INVALID_OPTIONS', `Invalid value "${value}" for ${option}.`, [
            `Allowed: ${allowed.map((a) => a.toLowerCase().replaceAll('_', '-')).join(', ')}`,
        ])
    }
    return match
}

export function parseViewMode(value: string): ViewMode {
    return parseEnum(value, VIEW_MODES, '--view-mode')
}

export function parseGroupedBy(value: string): GroupedBy {
    return parseEnum(value, GROUPED_BY_OPTIONS, '--group-by')
}

export function parseSortedBy(value: string): SortedBy {
    return parseEnum(value, SORTED_BY_OPTIONS, '--sort-by')
}

export function parseSortOrder(value: string): SortOrder {
    return parseEnum(value, SORT_ORDERS, '--sort-order')
}

export interface ViewOptionFlags {
    viewMode?: string
    groupBy?: string
    sortBy?: string
    sortOrder?: string
}

export interface ParsedViewOptions {
    viewMode?: ViewMode
    groupedBy?: GroupedBy
    sortedBy?: SortedBy
    sortOrder?: SortOrder
}

/** Returns `undefined` when no view-option flag was supplied. */
export function parseViewOptionFlags(flags: ViewOptionFlags): ParsedViewOptions | undefined {
    const parsed: ParsedViewOptions = {}
    if (flags.viewMode) parsed.viewMode = parseViewMode(flags.viewMode)
    if (flags.groupBy) parsed.groupedBy = parseGroupedBy(flags.groupBy)
    if (flags.sortBy) parsed.sortedBy = parseSortedBy(flags.sortBy)
    if (flags.sortOrder) parsed.sortOrder = parseSortOrder(flags.sortOrder)
    return Object.keys(parsed).length > 0 ? parsed : undefined
}

/** Human-readable summary for `--dry-run` output. */
export function describeViewOptions(options: ParsedViewOptions): string {
    return Object.entries(options)
        .map(([key, value]) => `${key}=${String(value).toLowerCase()}`)
        .join(', ')
}
