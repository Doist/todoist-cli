import type { Task } from '@doist/todoist-sdk'
import { getApiToken } from '../auth.js'
import { CliError } from '../errors.js'

// The `GET /tasks/completed/by_completion_date` endpoint caps each query at a
// 3-month window, so completed tasks older than that need multiple requests.
// There is no server-side filter for `goal_id` on this endpoint — completed
// items have to be scanned client-side via the `goal_ids` field on each item.
// To keep `td goal view --include-completed` bounded we walk backward from
// now in 3-month windows up to `MAX_WINDOWS` windows (≈2 years), stopping
// early once we've collected `expectedCount` matches.
const WINDOW_DAYS = 90
const MAX_WINDOWS = 8
const PAGE_LIMIT = 200
const MAX_PAGES_SAFETY = 200
const BASE_URL = 'https://api.todoist.com/api/v1'

interface RawDue {
    date: string
    string: string
    is_recurring: boolean
    datetime?: string | null
    timezone?: string | null
    lang?: string | null
}

interface RawDuration {
    amount: number
    unit: 'minute' | 'day'
}

interface RawDeadline {
    date: string
    lang: string
}

interface RawCompletedItem {
    id: string
    user_id: string
    project_id: string
    section_id: string | null
    parent_id: string | null
    added_by_uid: string | null
    assigned_by_uid: string | null
    responsible_uid: string | null
    labels: string[]
    deadline: RawDeadline | null
    duration: RawDuration | null
    checked: boolean
    is_deleted: boolean
    added_at: string | null
    completed_at: string | null
    updated_at: string | null
    due: RawDue | null
    priority: number
    child_order: number
    content: string
    description: string
    day_order: number
    is_collapsed: boolean
    goal_ids?: string[]
}

interface RawCompletedResponse {
    items?: RawCompletedItem[]
    next_cursor?: string | null
}

// The REST `/tasks/completed/by_completion_date` endpoint returns task items
// using Sync-style snake_case keys. Shape the result into the SDK's `Task`
// type so downstream renderers (`formatTaskRow`, JSON output) treat them the
// same as open tasks.
function toTask(raw: RawCompletedItem): Task {
    const due = raw.due
        ? {
              date: raw.due.date,
              string: raw.due.string,
              isRecurring: raw.due.is_recurring,
              datetime: raw.due.datetime ?? null,
              timezone: raw.due.timezone ?? null,
              lang: raw.due.lang ?? null,
          }
        : null

    return {
        id: raw.id,
        userId: raw.user_id,
        projectId: raw.project_id,
        sectionId: raw.section_id,
        parentId: raw.parent_id,
        addedByUid: raw.added_by_uid,
        assignedByUid: raw.assigned_by_uid,
        responsibleUid: raw.responsible_uid,
        labels: raw.labels ?? [],
        deadline: raw.deadline,
        duration: raw.duration,
        checked: raw.checked,
        isDeleted: raw.is_deleted,
        addedAt: raw.added_at ? new Date(raw.added_at) : null,
        completedAt: raw.completed_at ? new Date(raw.completed_at) : null,
        updatedAt: raw.updated_at ? new Date(raw.updated_at) : null,
        due,
        priority: raw.priority,
        childOrder: raw.child_order,
        content: raw.content,
        description: raw.description,
        dayOrder: raw.day_order,
        isCollapsed: raw.is_collapsed,
        isUncompletable: false,
        url: `https://app.todoist.com/app/task/${raw.id}`,
    } as unknown as Task
}

export interface FetchCompletedTasksForGoalOptions {
    goalId: string
    // Max number of completed tasks to return. Pass `Number.MAX_SAFE_INTEGER`
    // when the caller wants everything the goal has.
    limit: number
    // Upper bound reported by `goal.progress.completedTaskCount`; used as an
    // early-exit signal so we stop hitting the API once we've seen everything.
    expectedCount?: number
    // Injection seam for tests.
    fetchImpl?: typeof fetch
}

export interface FetchCompletedTasksForGoalResult {
    tasks: Task[]
    // True when we exhausted the lookback horizon before collecting every
    // match (i.e. the goal has linked tasks completed further back than we
    // scanned). Callers can use this to warn the user.
    truncated: boolean
}

export async function fetchCompletedTasksForGoal(
    options: FetchCompletedTasksForGoalOptions,
): Promise<FetchCompletedTasksForGoalResult> {
    const { goalId, limit, expectedCount, fetchImpl = fetch } = options

    if (limit <= 0 || expectedCount === 0) {
        return { tasks: [], truncated: false }
    }

    const token = await getApiToken()
    const ceiling = expectedCount && expectedCount > 0 ? Math.min(limit, expectedCount) : limit

    const results: Task[] = []
    let windowUntil = new Date()
    let windowsRun = 0
    let pagesFetched = 0

    while (results.length < ceiling && windowsRun < MAX_WINDOWS) {
        const windowSince = new Date(windowUntil)
        windowSince.setUTCDate(windowSince.getUTCDate() - WINDOW_DAYS)

        let cursor: string | null = null
        do {
            const url = new URL(`${BASE_URL}/tasks/completed/by_completion_date`)
            url.searchParams.set('since', windowSince.toISOString())
            url.searchParams.set('until', windowUntil.toISOString())
            url.searchParams.set('limit', String(PAGE_LIMIT))
            if (cursor) url.searchParams.set('cursor', cursor)

            const response = await fetchImpl(url, {
                headers: { Authorization: `Bearer ${token}` },
            })
            if (!response.ok) {
                throw new CliError(
                    'API_ERROR',
                    `Failed to fetch completed tasks for goal: HTTP ${response.status}`,
                )
            }

            const data = (await response.json()) as RawCompletedResponse
            const items = data.items ?? []
            for (const item of items) {
                if (item.goal_ids?.includes(goalId)) {
                    results.push(toTask(item))
                    if (results.length >= ceiling) break
                }
            }
            cursor = data.next_cursor ?? null
            pagesFetched += 1
            if (pagesFetched > MAX_PAGES_SAFETY) {
                throw new CliError('API_ERROR', 'Completed-task pagination exceeded safety limit')
            }
        } while (cursor && results.length < ceiling)

        windowUntil = windowSince
        windowsRun += 1
    }

    const truncated = results.length < ceiling && windowsRun >= MAX_WINDOWS
    return { tasks: results, truncated }
}
