import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./core.js', async (importOriginal) => ({
    pickDefined: (await importOriginal<typeof import('./core.js')>()).pickDefined,
    getApi: vi.fn(),
}))

import type { SyncCommand } from '@doist/todoist-sdk'
import { setupApiMock } from '../../test-support/api-mock.js'
import type { MockApi } from '../../test-support/mock-api.js'
import { deleteFilter, updateFilter } from './filters.js'

function sentCommands(mockApi: MockApi): SyncCommand[] {
    expect(mockApi.sync).toHaveBeenCalledTimes(1)
    return mockApi.sync.mock.calls[0][0].commands ?? []
}

describe('updateFilter', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('sends the filter change and the view change in one request', async () => {
        await updateFilter(
            'filter-1',
            { name: 'Team' },
            { sortedBy: 'PRIORITY', sortOrder: 'DESC' },
        )

        expect(sentCommands(mockApi)).toMatchObject([
            { type: 'filter_update', args: { id: 'filter-1', name: 'Team' } },
            {
                type: 'view_options_set',
                args: {
                    viewType: 'FILTER',
                    objectId: 'filter-1',
                    sortedBy: 'PRIORITY',
                    sortOrder: 'DESC',
                },
            },
        ])
    })

    it('leaves the filter itself alone when only the view changes', async () => {
        await updateFilter('filter-1', {}, { groupedBy: null })

        expect(sentCommands(mockApi)).toMatchObject([
            {
                type: 'view_options_set',
                args: { viewType: 'FILTER', objectId: 'filter-1', groupedBy: null },
            },
        ])
    })

    it('sends only filter_update when no view settings are given', async () => {
        await updateFilter('filter-1', { query: 'p1' })

        expect(sentCommands(mockApi)).toMatchObject([
            { type: 'filter_update', args: { id: 'filter-1', query: 'p1' } },
        ])
    })
})

describe('deleteFilter', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('deletes the filter through the REST endpoint', async () => {
        await deleteFilter('filter-123')

        expect(mockApi.deleteFilter).toHaveBeenCalledWith('filter-123')
        expect(mockApi.sync).not.toHaveBeenCalled()
    })
})
