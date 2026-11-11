import {
    GROUPED_BY_OPTIONS,
    VIEW_MODES,
    type GroupedBy,
    type ViewOptionsSetArgs,
} from '@todoist/sdk'
import { type Command, Option } from 'commander'
import { withCaseInsensitiveChoices } from './completion.js'
import { CliError } from './errors.js'
import {
    defaultDirectionFor,
    parseTaskSortDirection,
    parseTaskSortField,
    sortedByForField,
    TASK_SORT_DIRECTIONS,
    TASK_SORT_FIELDS,
} from './task-sort.js'

/**
 * Flags that save how a view looks in the Todoist apps: its layout, grouping
 * and sorting. They use the same words as `project --view-style` and
 * `filter view --sort`, so a sort saved here is the sort `td filter view`
 * then applies.
 *
 * The Sync API takes these values in uppercase (`BOARD`, `DUE_DATE`) and
 * rejects anything else, so the flags translate before anything is sent.
 */

const VIEW_STYLES = VIEW_MODES.map((mode) => mode.toLowerCase())

/**
 * Grouping, in the words `--sort` uses for the same fields. Keyed by the SDK's
 * own list, so a grouping the SDK adds fails the type check until it has a word.
 */
const GROUP_BY_WORDS: Record<GroupedBy, string> = {
    ASSIGNEE: 'assignee',
    ADDED_DATE: 'date-added',
    DUE_DATE: 'date',
    DEADLINE: 'deadline',
    LABEL: 'label',
    PRIORITY: 'priority',
    PROJECT: 'project',
    WORKSPACE: 'workspace',
}

/** `none` removes the grouping. */
const GROUP_BY_CHOICES = [...GROUPED_BY_OPTIONS.map((option) => GROUP_BY_WORDS[option]), 'none']

/** `none` means "no sorting at all", which a saved view can't hold. */
const SAVED_SORT_FIELDS = TASK_SORT_FIELDS.filter((field) => field !== 'none')

export type ViewOptionFlags = {
    viewStyle?: string
    groupBy?: string
    sort?: string
    sortOrder?: string
}

export type ViewSettings = Pick<
    ViewOptionsSetArgs,
    'viewMode' | 'groupedBy' | 'sortedBy' | 'sortOrder'
>

export type ParsedViewFlags = {
    settings: ViewSettings
    /** The same changes in the flags' own words, for previews and confirmations. */
    summary: Record<string, string>
    /** The same changes as command-line flags, for a retry hint. */
    flags: string[]
}

/** Registers `--view-style`, `--group-by`, `--sort` and `--sort-order`. */
export function addViewOptionFlags(command: Command): Command {
    return command
        .addOption(
            withCaseInsensitiveChoices(
                new Option('--view-style <style>', 'Layout in the Todoist apps'),
                VIEW_STYLES,
            ),
        )
        .addOption(
            withCaseInsensitiveChoices(
                new Option(
                    '--group-by <field>',
                    'Group tasks in the Todoist apps (none removes it)',
                ),
                GROUP_BY_CHOICES,
            ),
        )
        .addOption(
            withCaseInsensitiveChoices(
                new Option('--sort <field>', 'Sort tasks in the Todoist apps'),
                SAVED_SORT_FIELDS,
            ),
        )
        .addOption(
            withCaseInsensitiveChoices(
                new Option(
                    '--sort-order <direction>',
                    'Sort direction (default: desc for priority, asc otherwise; not with --sort default)',
                ),
                [...TASK_SORT_DIRECTIONS],
            ),
        )
}

/**
 * Turns the view flags into `view_options_set` arguments, or `undefined` when
 * none was given. The API merges what it receives into the saved view, so a
 * flag that is left out keeps its current value.
 *
 * `--sort` on its own also saves that field's usual direction, the one
 * `filter view --sort` would use, rather than keeping a direction picked for
 * some other field. `--sort-order` on its own sets the direction of whatever
 * field is saved. `--sort default` has no direction, so it takes none.
 */
export function parseViewOptionFlags(flags: ViewOptionFlags): ParsedViewFlags | undefined {
    const settings: ViewSettings = {}
    const summary: Record<string, string> = {}
    const asFlags: string[] = []

    if (flags.viewStyle) {
        const style = flags.viewStyle.toLowerCase()
        settings.viewMode = parseChoice(
            style,
            VIEW_MODES,
            (mode) => mode.toLowerCase(),
            '--view-style',
        )
        summary['View style'] = style
        asFlags.push('--view-style', style)
    }

    if (flags.groupBy) {
        const grouping = flags.groupBy.toLowerCase()
        settings.groupedBy =
            grouping === 'none'
                ? null
                : parseChoice(
                      grouping,
                      GROUPED_BY_OPTIONS,
                      (option) => GROUP_BY_WORDS[option],
                      '--group-by',
                  )
        summary['Group by'] = grouping
        asFlags.push('--group-by', grouping)
    }

    let direction = flags.sortOrder ? parseTaskSortDirection(flags.sortOrder) : undefined
    if (flags.sort) {
        const field = parseTaskSortField(flags.sort)
        const sortedBy = sortedByForField(field)
        if (!sortedBy) {
            throw new CliError('INVALID_OPTIONS', `A view can't be saved with --sort ${field}.`, [
                `Use one of: ${SAVED_SORT_FIELDS.join(', ')}`,
            ])
        }
        if (field === 'default' && direction) {
            throw new CliError(
                'CONFLICTING_OPTIONS',
                '--sort default has no direction, so it cannot take --sort-order.',
                ['Drop --sort-order, or pick a field to sort by'],
            )
        }
        settings.sortedBy = sortedBy
        summary.Sort = field
        asFlags.push('--sort', field)
        if (!direction && field !== 'default') direction = defaultDirectionFor(field)
    }
    if (direction) {
        settings.sortOrder = direction === 'desc' ? 'DESC' : 'ASC'
        summary['Sort order'] = direction
        asFlags.push('--sort-order', direction)
    }

    return Object.keys(settings).length > 0 ? { settings, summary, flags: asFlags } : undefined
}

/**
 * Commander's choices already reject unknown values on the command line; this
 * keeps the helper honest for any other caller.
 */
function parseChoice<T extends string>(
    value: string,
    options: readonly T[],
    word: (option: T) => string,
    flag: string,
): T {
    const match = options.find((option) => word(option) === value)
    if (match) return match
    throw new CliError('INVALID_OPTIONS', `Invalid value "${value}" for ${flag}.`, [
        `Allowed: ${options.map(word).join(', ')}`,
    ])
}
