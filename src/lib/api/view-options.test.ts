import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../auth.js', () => ({
    getApiToken: vi.fn(async () => 'test-token'),
}))

vi.mock('../usage-tracking.js', () => ({
    fetchTodoist: vi.fn(),
}))

import { fetchTodoist } from '../usage-tracking.js'
import { fetchViewOptions, fetchViewOptionsSafely, findViewOptions } from './view-options.js'
import type { SavedViewOptions } from './view-options.js'

const mockFetchTodoist = vi.mocked(fetchTodoist)

function respondWith(payload: unknown, ok = true): void {
    mockFetchTodoist.mockResolvedValue({
        ok,
        status: ok ? 200 : 500,
        statusText: ok ? 'OK' : 'Internal Server Error',
        json: async () => payload,
    } as unknown as Response)
}

function makeSaved(overrides: Partial<SavedViewOptions>): SavedViewOptions {
    return {
        viewType: 'FILTER',
        objectId: 'filter-1',
        sortedBy: null,
        sortOrder: null,
        groupedBy: null,
        viewMode: 'LIST',
        ...overrides,
    }
}

afterEach(() => {
    vi.clearAllMocks()
})

describe('fetchViewOptions', () => {
    it('maps the sync payload to camelCase', async () => {
        respondWith({
            view_options: [
                {
                    view_type: 'FILTER',
                    object_id: 'filter-1',
                    sorted_by: 'PRIORITY',
                    sort_order: 'DESC',
                    grouped_by: 'LABEL',
                    view_mode: 'LIST',
                    is_deleted: false,
                },
            ],
        })

        await expect(fetchViewOptions()).resolves.toEqual([
            {
                viewType: 'FILTER',
                objectId: 'filter-1',
                sortedBy: 'PRIORITY',
                sortOrder: 'DESC',
                groupedBy: 'LABEL',
                viewMode: 'LIST',
            },
        ])
    })

    // The API sends null here for Today and Upcoming, which is what stops the
    // SDK's typed sync from parsing this resource at all.
    it('keeps rows whose object_id is null', async () => {
        respondWith({
            view_options: [
                { view_type: 'UPCOMING', object_id: null, sort_order: 'ASC', is_deleted: false },
            ],
        })

        const [upcoming] = await fetchViewOptions()
        expect(upcoming).toMatchObject({ viewType: 'UPCOMING', objectId: null, sortOrder: 'ASC' })
    })

    it('drops deleted rows and rows with no view type', async () => {
        respondWith({
            view_options: [
                { view_type: 'FILTER', object_id: 'gone', is_deleted: true },
                { object_id: 'no-type' },
                null,
                { view_type: 'FILTER', object_id: 'kept' },
            ],
        })

        const results = await fetchViewOptions()
        expect(results.map((entry) => entry.objectId)).toEqual(['kept'])
    })

    it('returns an empty list when the payload has no view options', async () => {
        respondWith({})
        await expect(fetchViewOptions()).resolves.toEqual([])
    })

    it('throws on a failed request', async () => {
        respondWith({}, false)
        await expect(fetchViewOptions()).rejects.toThrow('HTTP 500')
    })
})

describe('fetchViewOptionsSafely', () => {
    it('swallows failures so a view still renders', async () => {
        mockFetchTodoist.mockRejectedValue(new Error('offline'))
        await expect(fetchViewOptionsSafely()).resolves.toEqual([])
    })
})

describe('findViewOptions', () => {
    const saved = [
        makeSaved({ viewType: 'PROJECT', objectId: 'shared-id' }),
        makeSaved({ viewType: 'FILTER', objectId: 'filter-1', sortedBy: 'DUE_DATE' }),
        makeSaved({ viewType: 'WORKSPACE_FILTER', objectId: 'filter-2', sortedBy: 'PRIORITY' }),
        makeSaved({ viewType: 'UPCOMING', objectId: null, sortedBy: 'DEADLINE' }),
    ]

    it('matches on view type and object id together', () => {
        expect(
            findViewOptions(saved, { viewTypes: ['FILTER'], objectId: 'filter-1' })?.sortedBy,
        ).toBe('DUE_DATE')
        expect(
            findViewOptions(saved, {
                viewTypes: ['FILTER', 'WORKSPACE_FILTER'],
                objectId: 'filter-2',
            })?.sortedBy,
        ).toBe('PRIORITY')
    })

    it('does not match an id saved under another view type', () => {
        expect(
            findViewOptions(saved, { viewTypes: ['FILTER'], objectId: 'shared-id' }),
        ).toBeUndefined()
    })

    it('finds singleton views, which have no object id', () => {
        expect(findViewOptions(saved, { viewTypes: ['UPCOMING'] })?.sortedBy).toBe('DEADLINE')
    })

    it('returns undefined when nothing matches', () => {
        expect(findViewOptions(saved, { viewTypes: ['FILTER'], objectId: 'nope' })).toBeUndefined()
    })
})
