import {
    GROUPED_BY_OPTIONS,
    SORT_ORDERS,
    SORTED_BY_OPTIONS,
    VIEW_MODES,
    VIEW_TYPES,
} from '@doist/todoist-sdk'
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

/**
 * Read an enum value only if it is one the SDK still knows about.
 *
 * The Sync API can grow a new member before the SDK types catch up, and a
 * value we don't recognise is better dropped than asserted into a type that
 * then lies to everything downstream. An unknown `sorted_by` reads as "no
 * saved sort", which lands the caller on Todoist's default ordering.
 */
function asMember<T extends string>(value: unknown, allowed: readonly T[]): T | null {
    const candidate = asString(value)
    return candidate && (allowed as readonly string[]).includes(candidate) ? (candidate as T) : null
}

function parseViewOptions(raw: RawViewOptions): SavedViewOptions | null {
    // A view type we can't name is one no caller can ask for, so the row goes.
    const viewType = asMember<ViewType>(raw.view_type, VIEW_TYPES)
    if (!viewType || raw.is_deleted === true) return null

    return {
        viewType,
        objectId: asString(raw.object_id),
        sortedBy: asMember<SortedBy>(raw.sorted_by, SORTED_BY_OPTIONS),
        sortOrder: asMember<SortOrder>(raw.sort_order, SORT_ORDERS),
        groupedBy: asMember<GroupedBy>(raw.grouped_by, GROUPED_BY_OPTIONS),
        viewMode: asMember<ViewMode>(raw.view_mode, VIEW_MODES),
    }
}

/**
 * Read every saved view option via the Sync API.
 *
 * This goes to `/sync` directly instead of through `api.sync()` for one
 * reason: `ViewOptionsSchema` types `object_id` as a required string, while
 * the API returns `null` for the singleton views (Today, Upcoming), so a typed
 * sync asking for `view_options` throws for anyone who has customised either
 * one. Making that single field nullable in the SDK is the whole fix. Once it
 * ships, this reader can drop back to `api.sync()` or move into the SDK
 * outright, and the enum handling below goes with it.
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
 * leaves a breadcrumb behind `-vv`.
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

/**
 * Find the saved options for one view, e.g. the FILTER view of a filter id.
 * `objectId` defaults to `null` so the singleton views (Today, Upcoming),
 * which the API stores with no object, can be looked up the same way.
 */
export function findViewOptions(
    viewOptions: SavedViewOptions[],
    { viewTypes, objectId = null }: { viewTypes: ViewType[]; objectId?: string | null },
): SavedViewOptions | undefined {
    return viewOptions.find(
        (entry) => entry.objectId === objectId && viewTypes.includes(entry.viewType),
    )
}
