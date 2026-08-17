import type { GroupedBy, SortedBy, SortOrder, ViewMode, ViewType } from '@doist/todoist-sdk'
import { getApiToken } from '../auth.js'
import { getLogger } from '../logger.js'
import { fetchTodoist } from '../usage-tracking.js'

const SYNC_ENDPOINT = 'https://api.todoist.com/api/v1/sync'

/**
 * The presentation settings the Todoist apps store per view (project, label,
 * filter, Today, Upcoming): list/board/calendar, grouping, and sorting.
 *
 * Named `SavedViewOptions` so it doesn't collide with `ViewOptions` in
 * `src/lib/options.ts`, which is the CLI's own output-flag bag.
 */
export interface SavedViewOptions {
    viewType: ViewType
    /** `null` for the singleton views (Today, Upcoming) that have no object. */
    objectId: string | null
    sortedBy: SortedBy | null
    sortOrder: SortOrder | null
    groupedBy: GroupedBy | null
    viewMode: ViewMode | null
}

interface RawViewOptions {
    view_type?: unknown
    object_id?: unknown
    sorted_by?: unknown
    sort_order?: unknown
    grouped_by?: unknown
    view_mode?: unknown
    is_deleted?: unknown
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null
}

function parseViewOptions(raw: RawViewOptions): SavedViewOptions | null {
    const viewType = asString(raw.view_type)
    if (!viewType || raw.is_deleted === true) return null

    return {
        viewType: viewType as ViewType,
        objectId: asString(raw.object_id),
        sortedBy: asString(raw.sorted_by) as SortedBy | null,
        sortOrder: asString(raw.sort_order) as SortOrder | null,
        groupedBy: asString(raw.grouped_by) as GroupedBy | null,
        viewMode: asString(raw.view_mode) as ViewMode | null,
    }
}

/**
 * Read every saved view option via the Sync API.
 *
 * This goes to `/sync` directly instead of through `api.sync()` because the
 * SDK's response schema types `object_id` as a required string, while the API
 * returns `null` for Today and Upcoming — so a typed sync that asks for
 * `view_options` throws for anyone who has customised either view. Parsing the
 * handful of fields we need here also means an unknown enum value can never
 * take down a read-only command.
 */
export async function fetchViewOptions(): Promise<SavedViewOptions[]> {
    const token = await getApiToken()
    const response = await fetchTodoist(SYNC_ENDPOINT, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            sync_token: '*',
            resource_types: JSON.stringify(['view_options']),
        }),
    })

    if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as { view_options?: unknown }
    if (!Array.isArray(data.view_options)) return []

    return data.view_options
        .map((entry) => parseViewOptions((entry ?? {}) as RawViewOptions))
        .filter((entry): entry is SavedViewOptions => entry !== null)
}

/**
 * Saved view options are a display nicety: when they can't be read, callers
 * should still render the list rather than fail. Returns `[]` on any error and
 * leaves a breadcrumb behind `-v`.
 */
export async function fetchViewOptionsSafely(): Promise<SavedViewOptions[]> {
    try {
        return await fetchViewOptions()
    } catch (error) {
        getLogger().detail('failed to load saved view options', {
            error: error instanceof Error ? error.message : String(error),
        })
        return []
    }
}

/** Find the saved options for one view, e.g. the FILTER view of a filter id. */
export function findViewOptions(
    viewOptions: SavedViewOptions[],
    { viewTypes, objectId }: { viewTypes: ViewType[]; objectId: string },
): SavedViewOptions | undefined {
    return viewOptions.find(
        (entry) => entry.objectId === objectId && viewTypes.includes(entry.viewType),
    )
}
