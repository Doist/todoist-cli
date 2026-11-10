import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./core.js', async (importOriginal) => ({
    pickDefined: (await importOriginal<typeof import('./core.js')>()).pickDefined,
    getApi: vi.fn(),
}))

import type { SyncCommand } from '@doist/todoist-sdk'
import { setupApiMock } from '../../test-support/api-mock.js'
import type { MockApi } from '../../test-support/mock-api.js'
import { CliError, SyncCommandError } from '../errors.js'
import {
    addFilter,
    type CommandFailure,
    deleteFilter,
    PartialFilterSaveError,
    updateFilter,
} from './filters.js'

const PREMIUM_ONLY: CommandFailure = {
    error: 'Premium only feature',
    errorCode: 32,
    errorExtra: {},
    errorTag: 'PREMIUM_ONLY',
    httpCode: 403,
}

const RATE_LIMITED: CommandFailure = {
    error: 'Too many requests',
    errorCode: 0,
    errorExtra: {},
    errorTag: 'TOO_MANY_REQUESTS',
    httpCode: 429,
}

const SERVICE_UNAVAILABLE: CommandFailure = {
    error: 'Service unavailable',
    errorCode: 0,
    errorExtra: {},
    errorTag: 'SERVICE_UNAVAILABLE',
    httpCode: 503,
}

function sentCommands(mockApi: MockApi): SyncCommand[] {
    expect(mockApi.sync).toHaveBeenCalledTimes(1)
    return mockApi.sync.mock.calls[0][0].commands ?? []
}

/**
 * Answers the next request as the Sync API does when some of its commands
 * fail: the others are applied, and whatever they created is in the mapping.
 */
function failCommands(
    mockApi: MockApi,
    failures: Record<number, CommandFailure>,
    createdId?: string,
): void {
    mockApi.sync.mockImplementationOnce(async ({ commands = [] }: { commands?: SyncCommand[] }) => {
        const syncStatus = Object.fromEntries(
            commands.map((command, index) => [command.uuid, failures[index] ?? 'ok']),
        )
        const created = commands[0]?.tempId
        const tempIdMapping = createdId && created ? { [created]: createdId } : {}
        const first = Object.values(failures)[0]
        throw new SyncCommandError(
            new CliError('API_ERROR', first.error),
            syncStatus,
            tempIdMapping,
        )
    })
}

describe('addFilter', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('saves the view in the same request, on the filter it creates', async () => {
        await addFilter({ name: 'Team', query: 'p1' }, { viewMode: 'BOARD' })

        const [add, view] = sentCommands(mockApi)
        expect(add).toMatchObject({ type: 'filter_add', args: { name: 'Team', query: 'p1' } })
        expect(view).toMatchObject({
            type: 'view_options_set',
            args: { viewType: 'FILTER', objectId: add.tempId, viewMode: 'BOARD' },
        })
    })

    it('reports a refused view with the ID of the filter it created', async () => {
        failCommands(mockApi, { 1: PREMIUM_ONLY }, 'filter-9')

        const error = await addFilter(
            { name: 'Team', query: 'p1' },
            { viewMode: 'CALENDAR' },
        ).catch((caught: unknown) => caught)

        expect(error).toBeInstanceOf(PartialFilterSaveError)
        expect(error).toMatchObject({ filterId: 'filter-9', saved: 'filter', refused: true })
    })

    it('tells a view that may save on a retry from one the API refused', async () => {
        failCommands(mockApi, { 1: SERVICE_UNAVAILABLE }, 'filter-9')

        const error = await addFilter({ name: 'Team', query: 'p1' }, { viewMode: 'BOARD' }).catch(
            (caught: unknown) => caught,
        )

        expect(error).toMatchObject({ filterId: 'filter-9', saved: 'filter', refused: false })
    })

    it('keeps a rate-limited view apart from a refused one, since a later retry can save it', async () => {
        failCommands(mockApi, { 1: RATE_LIMITED }, 'filter-9')

        const error = await addFilter({ name: 'Team', query: 'p1' }, { viewMode: 'BOARD' }).catch(
            (caught: unknown) => caught,
        )

        expect(error).toMatchObject({ filterId: 'filter-9', saved: 'filter', refused: false })
    })

    it('passes the error on unchanged when the filter itself was not created', async () => {
        failCommands(mockApi, { 0: PREMIUM_ONLY, 1: PREMIUM_ONLY })

        const error = await addFilter({ name: 'Team', query: 'p1' }, { viewMode: 'BOARD' }).catch(
            (caught: unknown) => caught,
        )

        expect(error).toBeInstanceOf(SyncCommandError)
        expect(error).not.toBeInstanceOf(PartialFilterSaveError)
    })
})

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

    it('reports the filter change as saved when only the view fails', async () => {
        failCommands(mockApi, { 1: PREMIUM_ONLY })

        const error = await updateFilter(
            'filter-1',
            { name: 'Team' },
            { viewMode: 'CALENDAR' },
        ).catch((caught: unknown) => caught)

        expect(error).toBeInstanceOf(PartialFilterSaveError)
        expect(error).toMatchObject({ filterId: 'filter-1', saved: 'filter', refused: true })
    })

    it('reports the view as saved when only the filter change fails', async () => {
        failCommands(mockApi, { 0: SERVICE_UNAVAILABLE })

        const error = await updateFilter('filter-1', { name: 'Team' }, { viewMode: 'BOARD' }).catch(
            (caught: unknown) => caught,
        )

        expect(error).toMatchObject({ filterId: 'filter-1', saved: 'view', refused: false })
    })

    it('passes the error on unchanged when nothing was saved', async () => {
        failCommands(mockApi, { 0: PREMIUM_ONLY })

        const error = await updateFilter('filter-1', {}, { viewMode: 'CALENDAR' }).catch(
            (caught: unknown) => caught,
        )

        expect(error).toBeInstanceOf(SyncCommandError)
        expect(error).not.toBeInstanceOf(PartialFilterSaveError)
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
