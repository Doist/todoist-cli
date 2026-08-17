import { isWorkspaceProject } from '@doist/todoist-sdk'
import type { SortedBy, SortOrder } from '@doist/todoist-sdk'
import { parseISO } from 'date-fns/parseISO'
import type { Project, Task } from './api/core.js'
import type { SavedViewOptions } from './api/view-options.js'
import { CliError } from './errors.js'

/**
 * Client-side task ordering that mirrors the Todoist apps.
 *
 * The API returns tasks in storage order and every Todoist client sorts them
 * locally — first by the sorting saved on the view, and when that is "Manual
 * (default)", by a documented per-view-type hierarchy. Without this, `td`
 * lists tasks in an order no other Todoist client shows.
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

/** Sync API `sorted_by` values → CLI sort fields. */
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
 * Todoist sorts ascending everywhere except priority, which reads p1 → p4 and
 * is stored as descending.
 */
export function defaultDirectionFor(field: TaskSortField): TaskSortDirection {
    return field === 'priority' ? 'desc' : 'asc'
}

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
export function taskSortFromViewOptions(viewOptions?: SavedViewOptions): TaskSort {
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
    projectIndex: Map<string, number>
    /** Project id → workspace bucket (0 is personal). */
    workspaceIndex: Map<string, number>
}

export interface TaskOrderContext extends Partial<ProjectOrder> {
    /** Assignee display name, used by assignee sorting. Unassigned sorts last. */
    assigneeName?: (task: Task) => string | null
    /**
     * True when the list is driven by dates — Today, Upcoming, and filters
     * whose query mentions dates lead with date instead of priority.
     */
    dateDriven?: boolean
}

/**
 * Lay projects out in sidebar order: Inbox, the personal tree, then each
 * workspace. Workspace grouping order isn't exposed by the API, so workspaces
 * are ordered by id — stable across runs, which is what a tie-break needs.
 */
export function buildProjectOrder(projects: Iterable<Project>): ProjectOrder {
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

    const buckets: Project[][] = [
        orderPersonalProjects(personal),
        ...[...byWorkspace.keys()].sort().map((id) => orderProjectTree(byWorkspace.get(id) ?? [])),
    ]

    const projectIndex = new Map<string, number>()
    const workspaceIndex = new Map<string, number>()
    let position = 0

    for (const [bucket, projectsInBucket] of buckets.entries()) {
        for (const project of projectsInBucket) {
            projectIndex.set(project.id, position++)
            workspaceIndex.set(project.id, bucket)
        }
    }

    return { projectIndex, workspaceIndex }
}

function orderPersonalProjects(projects: Project[]): Project[] {
    const inbox = projects.filter(isInboxProject)
    const rest = orderProjectTree(projects.filter((project) => !isInboxProject(project)))
    return [...inbox, ...rest]
}

function isInboxProject(project: Project): boolean {
    return 'inboxProject' in project && project.inboxProject === true
}

function parentProjectId(project: Project): string | null {
    return isWorkspaceProject(project) ? null : project.parentId
}

function folderKey(project: Project): string {
    return isWorkspaceProject(project) ? (project.folderId ?? '') : ''
}

/**
 * Depth-first walk of a project tree, siblings in `childOrder` order. Personal
 * projects nest under a parent project; workspace projects sit in folders
 * instead, so they are only kept folder-adjacent — folder order itself isn't
 * on the project record.
 */
function orderProjectTree(projects: Project[]): Project[] {
    const ids = new Set(projects.map((project) => project.id))
    const byParent = new Map<string | null, Project[]>()

    for (const project of projects) {
        const parent = parentProjectId(project)
        const parentId = parent && ids.has(parent) ? parent : null
        const siblings = byParent.get(parentId) ?? []
        siblings.push(project)
        byParent.set(parentId, siblings)
    }

    for (const siblings of byParent.values()) {
        siblings.sort(
            (a, b) =>
                compareText(folderKey(a), folderKey(b)) ||
                compare(a.childOrder, b.childOrder) ||
                compareText(a.name, b.name),
        )
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

const NO_VALUE = Number.POSITIVE_INFINITY

function compare(a: number, b: number): number {
    if (a === b) return 0
    return a < b ? -1 : 1
}

function compareText(a: string, b: string): number {
    return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
}

/**
 * Comparable instant for a due or deadline value.
 *
 * `parseISO` reads date-only values and floating datetimes in the local zone
 * and resolves `Z`/offset datetimes to their real instant, which puts all
 * three on one axis: a task due at 09:00 in Tokyo sorts against a floating
 * 09:00 by when it actually falls, and an all-day task still leads the timed
 * tasks on its day. `Date.parse` can't do this because it reads date-only
 * values as UTC and floating datetimes as local.
 */
function timestampOf(value: string): number {
    const parsed = parseISO(value).getTime()
    return Number.isNaN(parsed) ? NO_VALUE : parsed
}

function dueValue(task: Task): number {
    if (!task.due) return NO_VALUE
    return timestampOf(task.due.datetime ?? task.due.date)
}

function deadlineValue(task: Task): number {
    if (!task.deadline) return NO_VALUE
    return timestampOf(task.deadline.date)
}

/** Date-driven views fall back to the deadline when a task has no due date. */
function scheduleValue(task: Task): number {
    const due = dueValue(task)
    return due === NO_VALUE ? deadlineValue(task) : due
}

function addedValue(task: Task): number {
    return task.addedAt ? task.addedAt.getTime() : NO_VALUE
}

function projectValue(task: Task, context: TaskOrderContext): number {
    return context.projectIndex?.get(task.projectId) ?? NO_VALUE
}

function workspaceValue(task: Task, context: TaskOrderContext): number {
    return context.workspaceIndex?.get(task.projectId) ?? NO_VALUE
}

/**
 * The order Todoist falls back to when a view has no explicit sorting. Filters
 * that query dates (and the Today/Upcoming views) lead with date and time;
 * every other list leads with priority.
 */
function compareDefault(a: Task, b: Task, context: TaskOrderContext): number {
    if (context.dateDriven) {
        return (
            compare(scheduleValue(a), scheduleValue(b)) ||
            compare(b.priority, a.priority) ||
            compare(deadlineValue(a), deadlineValue(b)) ||
            compare(a.childOrder, b.childOrder) ||
            compare(addedValue(a), addedValue(b))
        )
    }

    return (
        compare(b.priority, a.priority) ||
        compare(dueValue(a), dueValue(b)) ||
        compare(deadlineValue(a), deadlineValue(b)) ||
        compare(projectValue(a, context), projectValue(b, context)) ||
        compare(a.childOrder, b.childOrder)
    )
}

function compareAssignee(a: Task, b: Task, context: TaskOrderContext): number {
    const nameA = context.assigneeName?.(a) ?? null
    const nameB = context.assigneeName?.(b) ?? null
    if (nameA === null || nameB === null) {
        if (nameA === nameB) return 0
        // Unassigned tasks sit at the end, like an absent date does.
        return nameA === null ? 1 : -1
    }
    return compareText(nameA, nameB)
}

function comparePrimary(field: TaskSortField, a: Task, b: Task, context: TaskOrderContext): number {
    switch (field) {
        case 'priority':
            return compare(a.priority, b.priority)
        case 'date':
            return compare(dueValue(a), dueValue(b))
        case 'deadline':
            return compare(deadlineValue(a), deadlineValue(b))
        case 'date-added':
            return compare(addedValue(a), addedValue(b))
        case 'name':
            return compareText(a.content, b.content)
        case 'project':
            return compare(projectValue(a, context), projectValue(b, context))
        case 'workspace':
            return compare(workspaceValue(a, context), workspaceValue(b, context))
        case 'assignee':
            return compareAssignee(a, b, context)
        default:
            return 0
    }
}

/**
 * Sort a task list the way a Todoist client would.
 *
 * Reversing only flips the primary criteria; the secondary criteria stay in
 * their default order, and values Todoist parks at the end of an ascending
 * list (no date, no assignee) move to the top when reversed.
 */
export function sortTasks(tasks: Task[], sort: TaskSort, context: TaskOrderContext = {}): Task[] {
    if (sort.field === 'none') return [...tasks]

    const reverse = sort.direction === 'desc' ? -1 : 1

    return [...tasks].sort((a, b) => {
        if (sort.field !== 'default') {
            const primary = comparePrimary(sort.field, a, b, context) * reverse
            if (primary !== 0) return primary
        }
        return compareDefault(a, b, context)
    })
}

/**
 * Tokens that make a filter query date-driven, which switches the default
 * ordering from priority-first to date-first. Todoist parses the query for
 * real; this is a keyword match over the English filter vocabulary, and the
 * only thing riding on it is which of two default orders applies.
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
 * "search: due diligence"), so those operands are dropped before the query is
 * inspected. A `search:` term runs to the next boolean operator or list comma.
 */
function stripNamedRefs(query: string): string {
    return query
        .replace(/"[^"]*"/g, ' ')
        .replace(/'[^']*'/g, ' ')
        .replace(/\bsearch\s*:[^&|(),]*/gi, ' ')
        .replace(/[#@/]{1,2}[^\s&|()!,]+/g, ' ')
}

export function queryUsesDates(query: string): boolean {
    return DATE_QUERY_PATTERN.test(stripNamedRefs(query))
}
