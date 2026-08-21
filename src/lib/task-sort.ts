import { isWorkspaceProject, sortTasks as sortTasksBySdk } from '@doist/todoist-sdk'
import type { SortedBy, SortOrder, TaskSortContext, ViewOptions } from '@doist/todoist-sdk'
import type { Project, Task } from './api/core.js'
import { CliError } from './errors.js'

/**
 * The CLI side of task ordering.
 *
 * The comparators themselves live in the SDK (`sortTasks`), which is where
 * every Todoist client can share them. What stays here is the vocabulary the
 * `--sort` flag speaks, the mapping from a saved view to that vocabulary, the
 * sidebar layout the SDK wants as a lookup, and the guess at whether a filter
 * query is date-driven, which the SDK asks the caller to decide.
 *
 * @see https://www.todoist.com/help/articles/default-sorting-order-for-todoist-tasks-mqmgerY7
 */

export const TASK_SORT_FIELDS = [
    'default',
    'priority',
    'date',
    'deadline',
    'date-added',
    'name',
    'project',
    'assignee',
    'workspace',
    'none',
] as const

export type TaskSortField = (typeof TASK_SORT_FIELDS)[number]

export const TASK_SORT_DIRECTIONS = ['asc', 'desc'] as const

export type TaskSortDirection = (typeof TASK_SORT_DIRECTIONS)[number]

export interface TaskSort {
    field: TaskSortField
    direction: TaskSortDirection
}

export const DEFAULT_TASK_SORT: TaskSort = { field: 'default', direction: 'asc' }

/** Saved `sorted_by` values → the vocabulary `--sort` speaks. */
const FIELD_BY_SORTED_BY: Record<SortedBy, TaskSortField> = {
    MANUAL: 'default',
    ALPHABETICALLY: 'name',
    ASSIGNEE: 'assignee',
    DUE_DATE: 'date',
    DEADLINE: 'deadline',
    ADDED_DATE: 'date-added',
    PRIORITY: 'priority',
    PROJECT: 'project',
    WORKSPACE: 'workspace',
}

/** And back again for the SDK call. `default` maps to MANUAL; only `none` is absent. */
const SORTED_BY_FIELD: Partial<Record<TaskSortField, SortedBy>> = Object.fromEntries(
    Object.entries(FIELD_BY_SORTED_BY).map(([sortedBy, field]) => [field, sortedBy]),
)

const FIELD_LABELS: Record<TaskSortField, { asc: string; desc: string }> = {
    default: { asc: 'Todoist default', desc: 'Todoist default' },
    priority: { asc: 'Priority (p4 first)', desc: 'Priority (p1 first)' },
    date: { asc: 'Due date (earliest first)', desc: 'Due date (latest first)' },
    deadline: { asc: 'Deadline (earliest first)', desc: 'Deadline (latest first)' },
    'date-added': { asc: 'Date added (oldest first)', desc: 'Date added (newest first)' },
    name: { asc: 'Name (A-Z)', desc: 'Name (Z-A)' },
    project: { asc: 'Project order', desc: 'Project order (reversed)' },
    assignee: { asc: 'Assignee (A-Z)', desc: 'Assignee (Z-A)' },
    workspace: { asc: 'Workspace order', desc: 'Workspace order (reversed)' },
    none: { asc: 'None (API order)', desc: 'None (API order)' },
}

/**
 * Todoist sorts ascending everywhere except priority, which reads p1 to p4 and
 * is stored as descending.
 */
export function defaultDirectionFor(field: TaskSortField): TaskSortDirection {
    return field === 'priority' ? 'desc' : 'asc'
}

/**
 * The `--sort` flag is registered with Commander choices, so a bad value never
 * reaches here from the command line. This guards the exported helper for any
 * other caller, and keeps the error a `CliError` rather than a cast.
 */
export function parseTaskSortField(value: string): TaskSortField {
    const normalized = value.trim().toLowerCase()
    const match = TASK_SORT_FIELDS.find((field) => field === normalized)
    if (match) return match
    throw new CliError('INVALID_SORT', `Invalid sort field "${value}".`, [
        `Valid fields: ${TASK_SORT_FIELDS.join(', ')}`,
    ])
}

export function parseTaskSortDirection(value: string): TaskSortDirection {
    const normalized = value.trim().toLowerCase()
    const match = TASK_SORT_DIRECTIONS.find((direction) => direction === normalized)
    if (match) return match
    throw new CliError('INVALID_SORT_ORDER', `Invalid sort order "${value}".`, [
        `Valid orders: ${TASK_SORT_DIRECTIONS.join(', ')}`,
    ])
}

/** The sorting a saved view applies, or the Todoist default when it has none. */
export function taskSortFromViewOptions(viewOptions?: ViewOptions): TaskSort {
    const sortedBy = viewOptions?.sortedBy
    const field = sortedBy ? (FIELD_BY_SORTED_BY[sortedBy] ?? 'default') : 'default'
    if (field === 'default') return DEFAULT_TASK_SORT

    return { field, direction: directionFromSortOrder(viewOptions?.sortOrder, field) }
}

function directionFromSortOrder(
    sortOrder: SortOrder | null | undefined,
    field: TaskSortField,
): TaskSortDirection {
    if (sortOrder === 'ASC') return 'asc'
    if (sortOrder === 'DESC') return 'desc'
    return defaultDirectionFor(field)
}

export function formatTaskSort(sort: TaskSort): string {
    return FIELD_LABELS[sort.field][sort.direction]
}

/**
 * Every sort but `none` needs the project list. Project order is the fourth
 * criterion of the default hierarchy, and the default hierarchy is the
 * tie-break under every named sort, so skipping the fetch for, say, a name
 * sort would order equal names differently from the same sort in another
 * output mode. Assignee sorting needs it too, to resolve collaborators.
 */
export function sortNeedsProjects(field: TaskSortField): boolean {
    return field !== 'none'
}

/** Only assignee sorting needs collaborator names resolved. */
export function sortNeedsCollaborators(field: TaskSortField): boolean {
    return field === 'assignee'
}

export interface ProjectOrder {
    /** Project id → position in the sidebar. */
    projectOrder: Map<string, number>
    /** Project id → workspace bucket (0 is personal). */
    workspaceOrder: Map<string, number>
}

export interface TaskOrderContext extends Partial<ProjectOrder> {
    /** Assignee display name, used by assignee sorting. Unassigned sorts last. */
    assigneeName?: (task: Task) => string | null
    /**
     * IANA timezone the SDK resolves floating due times in. Pass the Todoist
     * account's, not the machine's: the two differ often enough to reverse
     * pairs of timed tasks around midnight.
     */
    timezone?: string
    /**
     * True when the list is driven by dates: Today, Upcoming, and filters
     * whose query mentions dates lead with date instead of priority.
     */
    dateDriven?: boolean
}

/**
 * Lay projects out in sidebar order: Inbox, the personal tree, then each
 * workspace.
 *
 * Personal projects nest, so they walk their tree by `childOrder`. Workspace
 * projects don't: they carry `defaultOrder` for their position and leave
 * `childOrder` at 0, so ordering them by `childOrder` produces no order at
 * all. Pass `workspaceNames` to sort the workspaces themselves the way the
 * sidebar and `td project list` do, by name; without it they fall back to id,
 * which is stable but arbitrary.
 */
export function buildProjectOrder(
    projects: Iterable<Project>,
    { workspaceNames }: { workspaceNames?: Map<string, string> } = {},
): ProjectOrder {
    const personal: Project[] = []
    const byWorkspace = new Map<string, Project[]>()

    for (const project of projects) {
        if (isWorkspaceProject(project)) {
            const bucket = byWorkspace.get(project.workspaceId) ?? []
            bucket.push(project)
            byWorkspace.set(project.workspaceId, bucket)
        } else {
            personal.push(project)
        }
    }

    const orderedWorkspaceIds = [...byWorkspace.keys()].sort((a, b) => {
        const nameA = workspaceNames?.get(a)
        const nameB = workspaceNames?.get(b)
        if (nameA && nameB) return compareText(nameA, nameB)
        return compareText(a, b)
    })

    const buckets: Project[][] = [
        orderPersonalProjects(personal),
        ...orderedWorkspaceIds.map((id) => orderWorkspaceProjects(byWorkspace.get(id) ?? [])),
    ]

    const projectOrder = new Map<string, number>()
    const workspaceOrder = new Map<string, number>()
    let position = 0

    for (const [bucket, projectsInBucket] of buckets.entries()) {
        for (const project of projectsInBucket) {
            projectOrder.set(project.id, position++)
            workspaceOrder.set(project.id, bucket)
        }
    }

    return { projectOrder, workspaceOrder }
}

function orderPersonalProjects(projects: Project[]): Project[] {
    const inbox = projects.filter(isInboxProject)
    const rest = orderProjectTree(projects.filter((project) => !isInboxProject(project)))
    return [...inbox, ...rest]
}

function isInboxProject(project: Project): boolean {
    return 'inboxProject' in project && project.inboxProject === true
}

/**
 * `defaultOrder` is the workspace's own sequence for its projects, folders
 * included, which is what the sidebar draws.
 */
function orderWorkspaceProjects(projects: Project[]): Project[] {
    return [...projects].sort(
        (a, b) => compare(a.defaultOrder, b.defaultOrder) || compareText(a.name, b.name),
    )
}

/** Depth-first walk of the personal project tree, siblings in `childOrder` order. */
function orderProjectTree(projects: Project[]): Project[] {
    const ids = new Set(projects.map((project) => project.id))
    const byParent = new Map<string | null, Project[]>()

    for (const project of projects) {
        const parent = isWorkspaceProject(project) ? null : project.parentId
        const parentId = parent && ids.has(parent) ? parent : null
        const siblings = byParent.get(parentId) ?? []
        siblings.push(project)
        byParent.set(parentId, siblings)
    }

    for (const siblings of byParent.values()) {
        siblings.sort((a, b) => compare(a.childOrder, b.childOrder) || compareText(a.name, b.name))
    }

    const ordered: Project[] = []
    const visited = new Set<string>()

    function visit(parentId: string | null): void {
        for (const project of byParent.get(parentId) ?? []) {
            if (visited.has(project.id)) continue
            visited.add(project.id)
            ordered.push(project)
            visit(project.id)
        }
    }

    visit(null)
    return ordered
}

function compare(a: number, b: number): number {
    if (a === b) return 0
    return a < b ? -1 : 1
}

function compareText(a: string, b: string): number {
    return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
}

/**
 * Sort a task list the way a Todoist client would, by handing the SDK the
 * pieces only the CLI can know: which hierarchy this list falls back to, where
 * each project sits in the sidebar, how to name an assignee, and which
 * timezone a floating due time belongs to.
 */
export function sortTasks(tasks: Task[], sort: TaskSort, context: TaskOrderContext = {}): Task[] {
    if (sort.field === 'none') return [...tasks]

    return sortTasksBySdk(
        tasks,
        {
            sortedBy: SORTED_BY_FIELD[sort.field] ?? null,
            sortOrder: sort.direction === 'desc' ? 'DESC' : 'ASC',
            defaultOrder: context.dateDriven ? 'DATE_FIRST' : 'PRIORITY_FIRST',
        },
        {
            projectOrder: context.projectOrder,
            workspaceOrder: context.workspaceOrder,
            assigneeName: context.assigneeName,
            timezone: context.timezone,
        } satisfies TaskSortContext,
    )
}

/**
 * Tokens that make a filter query date-driven, which switches the default
 * ordering from priority-first to date-first.
 *
 * Known limitation: these are the English keywords. The backend parses a saved
 * query in the account's language when the request carries no `lang`, so a
 * filter written as "hoy" or "heute" reads as priority-first here. Classifying
 * properly means the query parser, which is Filterist's job rather than a
 * regex's, so the fix belongs in the SDK. Until then the cost is one of two
 * default hierarchies, not a wrong result set.
 */
const DATE_QUERY_PATTERN = new RegExp(
    [
        String.raw`\b(?:today|tomorrow|yesterday|overdue|due|dated?|datetime|deadlines?|recurring)\b`,
        String.raw`\b(?:mon|tue|wed|thu|fri|sat|sun)\b`,
        String.raw`\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b`,
        String.raw`\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b`,
        String.raw`\b(?:before|after)\s*:`,
        String.raw`\b\d+\s*(?:days?|hours?|weeks?|months?)\b`,
        String.raw`\b(?:next|last)\s+(?:week|month|year|\d+)`,
    ].join('|'),
    'i',
)

/**
 * Names and free-text searches can contain date words ("#May launch",
 * "#due date", "search: due diligence"), so those operands are dropped before
 * the query is inspected. Todoist ends a name at an operator rather than at a
 * space, so these run to the next one and take the whole name with them.
 */
function stripNamedRefs(query: string): string {
    return query
        .replace(/"[^"]*"/g, ' ')
        .replace(/'[^']*'/g, ' ')
        .replace(/\bsearch\s*:[^&|(),]*/gi, ' ')
        .replace(/[#@/]{1,2}[^&|(),]*/g, ' ')
}

export function queryUsesDates(query: string): boolean {
    return DATE_QUERY_PATTERN.test(stripNamedRefs(query))
}
