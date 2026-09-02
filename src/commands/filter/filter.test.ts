import { captureConsole, captureStream, createTestProgram } from '@doist/cli-core/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/api/core.js', () => ({
    getApi: vi.fn(),
    getAccountTimezone: vi.fn(async () => 'US/Pacific'),
}))

vi.mock('../../lib/api/workspaces.js', () => ({
    fetchWorkspaces: vi.fn(async () => []),
}))

vi.mock('../../lib/api/filters.js', () => ({
    fetchFilters: vi.fn(),
    addFilter: vi.fn(),
    updateFilter: vi.fn(),
    deleteFilter: vi.fn(),
}))

import type { ViewOptions as SavedViewOptions } from '@doist/todoist-sdk'
import { getAccountTimezone } from '../../lib/api/core.js'
import { addFilter, deleteFilter, fetchFilters, updateFilter } from '../../lib/api/filters.js'
import { setupApiMock } from '../../test-support/api-mock.js'
import { fixtures, makeFilter } from '../../test-support/fixtures.js'
import { type MockApi } from '../../test-support/mock-api.js'
import { registerFilterCommand } from './index.js'
import { splitFilterQueries } from './view.js'

const mockFetchFilters = vi.mocked(fetchFilters)
const mockAccountTimezone = vi.mocked(getAccountTimezone)
const mockAddFilter = vi.mocked(addFilter)
const mockUpdateFilter = vi.mocked(updateFilter)
const mockDeleteFilter = vi.mocked(deleteFilter)

function createProgram() {
    return createTestProgram(registerFilterCommand)
}

describe('splitFilterQueries', () => {
    it('ignores empty filter sections', () => {
        expect(splitFilterQueries('today,,  , tomorrow')).toEqual(['today', 'tomorrow'])
    })

    it('only splits commas preceded by an even number of backslashes', () => {
        expect(splitFilterQueries(String.raw`#Research\, Inc, today`)).toEqual([
            String.raw`#Research\, Inc`,
            'today',
        ])
        expect(splitFilterQueries(String.raw`#Research\\, Inc, today`)).toEqual([
            String.raw`#Research\\`,
            'Inc',
            'today',
        ])
    })
})

describe('filter list', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('lists all filters', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Work tasks', query: '@work' }),
            makeFilter({ id: 'filter-2', name: 'Urgent', query: 'p1', isFavorite: true }),
        ])

        await program.parseAsync(['node', 'td', 'filter', 'list'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Work tasks'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Urgent'))
    })

    it('shows "No filters found" when empty', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockFetchFilters.mockResolvedValue([])

        await program.parseAsync(['node', 'td', 'filter', 'list'])

        expect(consoleSpy).toHaveBeenCalledWith('No filters found.')
    })

    it('outputs JSON with --json flag', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Work', query: '@work' }),
        ])

        await program.parseAsync(['node', 'td', 'filter', 'list', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.results).toBeDefined()
        expect(parsed.results[0].name).toBe('Work')
    })

    it('outputs NDJSON with --ndjson flag', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Work', query: '@work' }),
            makeFilter({ id: 'filter-2', name: 'Home', query: '@home' }),
        ])

        await program.parseAsync(['node', 'td', 'filter', 'list', '--ndjson'])

        const output = consoleSpy.mock.calls[0][0]
        const lines = output.split('\n')
        expect(lines).toHaveLength(2)
    })
})

describe('filter create --json', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('outputs created filter as JSON', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockAddFilter.mockResolvedValue({
            id: 'filter-new',
            name: 'My Filter',
            query: 'today',
            color: 'charcoal',
            isFavorite: false,
            isDeleted: false,
            isFrozen: false,
            itemOrder: 0,
        })

        await program.parseAsync([
            'node',
            'td',
            'filter',
            'create',
            '--name',
            'My Filter',
            '--query',
            'today',
            '--json',
        ])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.id).toBe('filter-new')
        expect(parsed.name).toBe('My Filter')
        expect(parsed.query).toBe('today')
        expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Created:'))
    })

    it('keeps the description in the JSON output', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockAddFilter.mockResolvedValue({
            id: 'filter-new',
            name: 'My Filter',
            query: 'today',
            description: 'Everything for the day job',
            color: 'charcoal',
            isFavorite: false,
            isDeleted: false,
            isFrozen: false,
            itemOrder: 0,
        })

        await program.parseAsync([
            'node',
            'td',
            'filter',
            'create',
            '--name',
            'My Filter',
            '--query',
            'today',
            '--description',
            'Everything for the day job',
            '--json',
        ])

        const parsed = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(parsed.description).toBe('Everything for the day job')
    })
})

describe('filter create', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('creates filter with name and query', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockAddFilter.mockResolvedValue(
            makeFilter({ id: 'filter-new', name: 'Work', query: '@work' }),
        )

        await program.parseAsync([
            'node',
            'td',
            'filter',
            'create',
            '--name',
            'Work',
            '--query',
            '@work',
        ])

        expect(mockAddFilter).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Work', query: '@work' }),
        )
        expect(consoleSpy).toHaveBeenCalledWith('Created: Work')
    })

    it('creates filter with --description', async () => {
        const program = createProgram()
        captureConsole()

        mockAddFilter.mockResolvedValue(
            makeFilter({ id: 'filter-new', name: 'Work', query: '@work' }),
        )

        await program.parseAsync([
            'node',
            'td',
            'filter',
            'create',
            '--name',
            'Work',
            '--query',
            '@work',
            '--description',
            'Everything for the day job',
        ])

        expect(mockAddFilter).toHaveBeenCalledWith(
            expect.objectContaining({ description: 'Everything for the day job' }),
        )
    })

    it('creates filter with --color', async () => {
        const program = createProgram()
        captureConsole()

        mockAddFilter.mockResolvedValue(
            makeFilter({ id: 'filter-new', name: 'Urgent', query: 'p1', color: 'red' }),
        )

        await program.parseAsync([
            'node',
            'td',
            'filter',
            'create',
            '--name',
            'Urgent',
            '--query',
            'p1',
            '--color',
            'red',
        ])

        expect(mockAddFilter).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Urgent', query: 'p1', color: 'red' }),
        )
    })

    it('creates filter with --favorite', async () => {
        const program = createProgram()
        captureConsole()

        mockAddFilter.mockResolvedValue(
            makeFilter({ id: 'filter-new', name: 'Important', query: 'p1 | p2', isFavorite: true }),
        )

        await program.parseAsync([
            'node',
            'td',
            'filter',
            'create',
            '--name',
            'Important',
            '--query',
            'p1 | p2',
            '--favorite',
        ])

        expect(mockAddFilter).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Important', isFavorite: true }),
        )
    })

    it('shows filter ID after creation', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockAddFilter.mockResolvedValue(
            makeFilter({ id: 'filter-xyz', name: 'Test', query: 'today' }),
        )

        await program.parseAsync([
            'node',
            'td',
            'filter',
            'create',
            '--name',
            'Test',
            '--query',
            'today',
        ])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('id:filter-xyz'))
    })
})

describe('filter delete', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('shows dry-run without --yes', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Work', query: '@work' }),
        ])

        await program.parseAsync(['node', 'td', 'filter', 'delete', 'Work'])

        expect(mockDeleteFilter).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith('Would delete: Work')
        expect(consoleSpy).toHaveBeenCalledWith('Use --yes to confirm.')
    })

    it('deletes by name with --yes', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Work', query: '@work' }),
        ])
        mockDeleteFilter.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'filter', 'delete', 'Work', '--yes'])

        expect(mockDeleteFilter).toHaveBeenCalledWith('filter-1')
        expect(consoleSpy).toHaveBeenCalledWith('Deleted: Work (id:filter-1)')
    })

    it('deletes by id: prefix with --yes', async () => {
        const program = createProgram()
        captureConsole()

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-123', name: 'Work', query: '@work' }),
        ])
        mockDeleteFilter.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'filter', 'delete', 'id:filter-123', '--yes'])

        expect(mockDeleteFilter).toHaveBeenCalledWith('filter-123')
    })

    it('throws for non-existent filter', async () => {
        const program = createProgram()

        mockFetchFilters.mockResolvedValue([])

        await expect(
            program.parseAsync(['node', 'td', 'filter', 'delete', 'nonexistent', '--yes']),
        ).rejects.toHaveProperty('code', 'FILTER_NOT_FOUND')
    })
})

describe('filter update', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('updates filter name', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Old Name', query: '@work' }),
        ])
        mockUpdateFilter.mockResolvedValue(undefined)

        await program.parseAsync([
            'node',
            'td',
            'filter',
            'update',
            'Old Name',
            '--name',
            'New Name',
        ])

        expect(mockUpdateFilter).toHaveBeenCalledWith('filter-1', {
            name: 'New Name',
        })
        expect(consoleSpy).toHaveBeenCalledWith('Updated: Old Name -> New Name (id:filter-1)')
    })

    it('updates filter description', async () => {
        const program = createProgram()
        captureConsole()

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Work', query: '@work' }),
        ])
        mockUpdateFilter.mockResolvedValue(undefined)

        await program.parseAsync([
            'node',
            'td',
            'filter',
            'update',
            'Work',
            '--description',
            'Everything for the day job',
        ])

        expect(mockUpdateFilter).toHaveBeenCalledWith('filter-1', {
            description: 'Everything for the day job',
        })
    })

    it('clears the description with --no-description', async () => {
        const program = createProgram()
        captureConsole()

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Work', query: '@work' }),
        ])
        mockUpdateFilter.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'filter', 'update', 'Work', '--no-description'])

        // null is the API's "clear it"; an absent key would leave the description alone.
        expect(mockUpdateFilter).toHaveBeenCalledWith('filter-1', {
            description: null,
        })
    })

    it('updates filter query', async () => {
        const program = createProgram()
        captureConsole()

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Work', query: '@work' }),
        ])
        mockUpdateFilter.mockResolvedValue(undefined)

        await program.parseAsync([
            'node',
            'td',
            'filter',
            'update',
            'Work',
            '--query',
            '@work & p1',
        ])

        expect(mockUpdateFilter).toHaveBeenCalledWith('filter-1', {
            query: '@work & p1',
        })
    })

    it('updates filter color and favorite', async () => {
        const program = createProgram()
        captureConsole()

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Work', query: '@work' }),
        ])
        mockUpdateFilter.mockResolvedValue(undefined)

        await program.parseAsync([
            'node',
            'td',
            'filter',
            'update',
            'Work',
            '--color',
            'red',
            '--favorite',
        ])

        expect(mockUpdateFilter).toHaveBeenCalledWith('filter-1', {
            color: 'red',
            isFavorite: true,
        })
    })

    it('removes favorite with --no-favorite', async () => {
        const program = createProgram()
        captureConsole()

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Work', query: '@work', isFavorite: true }),
        ])
        mockUpdateFilter.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'filter', 'update', 'Work', '--no-favorite'])

        expect(mockUpdateFilter).toHaveBeenCalledWith('filter-1', {
            isFavorite: false,
        })
    })

    it('updates by id: prefix', async () => {
        const program = createProgram()
        captureConsole()

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-123', name: 'Work', query: '@work' }),
        ])
        mockUpdateFilter.mockResolvedValue(undefined)

        await program.parseAsync([
            'node',
            'td',
            'filter',
            'update',
            'id:filter-123',
            '--color',
            'blue',
        ])

        expect(mockUpdateFilter).toHaveBeenCalledWith('filter-123', {
            color: 'blue',
        })
    })

    it('throws when no changes specified', async () => {
        const program = createProgram()

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Work', query: '@work' }),
        ])

        await expect(
            program.parseAsync(['node', 'td', 'filter', 'update', 'Work']),
        ).rejects.toHaveProperty('code', 'NO_CHANGES')
    })

    it('throws for non-existent filter', async () => {
        const program = createProgram()

        mockFetchFilters.mockResolvedValue([])

        await expect(
            program.parseAsync([
                'node',
                'td',
                'filter',
                'update',
                'nonexistent',
                '--name',
                'new-name',
            ]),
        ).rejects.toHaveProperty('code', 'FILTER_NOT_FOUND')
    })
})

describe('filter show', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('shows tasks matching filter', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Work', query: '@work' }),
        ])

        mockApi.getTasksByFilter.mockResolvedValue({
            results: [
                {
                    id: 'task-1',
                    content: 'Work task 1',
                    projectId: 'proj-1',
                    priority: 1,
                    labels: [],
                },
            ],
            nextCursor: null,
        })

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work Project' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'filter', 'show', 'Work'])

        expect(mockApi.getTasksByFilter).toHaveBeenCalledWith(
            expect.objectContaining({ query: '@work' }),
        )
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Work'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Work task 1'))
    })

    it('shows comma-separated filter sections', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockFetchFilters.mockResolvedValue([
            makeFilter({
                id: 'filter-1',
                name: 'Dashboard',
                query: 'due today, due tomorrow, no date',
            }),
        ])

        mockApi.getTasksByFilter
            .mockResolvedValueOnce({
                results: [
                    {
                        ...fixtures.tasks.basic,
                        id: 'task-today',
                        content: 'Due today',
                    },
                ],
                nextCursor: null,
            })
            .mockResolvedValueOnce({
                results: [
                    {
                        ...fixtures.tasks.basic,
                        id: 'task-tomorrow',
                        content: 'Due tomorrow',
                    },
                ],
                nextCursor: null,
            })
            .mockResolvedValueOnce({ results: [], nextCursor: null })

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work Project' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'filter', 'show', 'Dashboard'])

        expect(mockApi.getTasksByFilter).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ query: 'due today' }),
        )
        expect(mockApi.getTasksByFilter).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ query: 'due tomorrow' }),
        )
        expect(mockApi.getTasksByFilter).toHaveBeenNthCalledWith(
            3,
            expect.objectContaining({ query: 'no date' }),
        )

        const output = consoleSpy.mock.calls.map(([line]) => String(line)).join('\n')
        expect(output).toContain('--- due today ---')
        expect(output).toContain('Due today')
        expect(output).toContain('--- due tomorrow ---')
        expect(output).toContain('Due tomorrow')
        expect(output).toContain('--- no date ---')
        expect(output).toContain('No tasks match this section.')
    })

    it('does not load projects when every filter section is empty', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Dashboard', query: 'today, tomorrow' }),
        ])
        mockApi.getTasksByFilter.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'filter', 'show', 'Dashboard'])

        expect(mockApi.getProjects).not.toHaveBeenCalled()
        const output = consoleSpy.mock.calls.map(([line]) => String(line)).join('\n')
        expect(output).toContain('--- today ---')
        expect(output).toContain('--- tomorrow ---')
        expect(output.match(/No tasks match this section\./g)).toHaveLength(2)
    })

    it('caps concurrent filter section requests while keeping them parallel', async () => {
        const program = createProgram()
        captureConsole()
        const queries = Array.from({ length: 7 }, (_, index) => `query-${index + 1}`)
        let activeRequests = 0
        let maxActiveRequests = 0

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Dashboard', query: queries.join(',') }),
        ])
        mockApi.getTasksByFilter.mockImplementation(async () => {
            activeRequests++
            maxActiveRequests = Math.max(maxActiveRequests, activeRequests)
            await Promise.resolve()
            activeRequests--
            return { results: [], nextCursor: null }
        })

        await program.parseAsync(['node', 'td', 'filter', 'show', 'Dashboard', '--json'])

        expect(mockApi.getTasksByFilter).toHaveBeenCalledTimes(queries.length)
        expect(maxActiveRequests).toBeGreaterThan(1)
        expect(maxActiveRequests).toBeLessThan(queries.length)
    })

    it('groups comma-separated filter sections in JSON output', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Dashboard', query: 'today, p1' }),
        ])

        const matchingTask = {
            ...fixtures.tasks.basic,
            id: 'task-1',
            content: 'Urgent today',
            priority: 4,
        }
        mockApi.getTasksByFilter
            .mockResolvedValueOnce({ results: [matchingTask], nextCursor: null })
            .mockResolvedValueOnce({ results: [matchingTask], nextCursor: 'next-p1' })

        await program.parseAsync([
            'node',
            'td',
            'filter',
            'show',
            'Dashboard',
            '--json',
            '--limit',
            '1',
            '--sort',
            'none',
        ])

        const parsed = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(parsed).toEqual({
            sections: [
                {
                    query: 'today',
                    results: [expect.objectContaining({ id: 'task-1' })],
                    nextCursor: null,
                },
                {
                    query: 'p1',
                    results: [expect.objectContaining({ id: 'task-1' })],
                    nextCursor: 'next-p1',
                },
            ],
        })
    })

    it('outputs one NDJSON record per filter section', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Dashboard', query: 'today, tomorrow' }),
        ])
        mockApi.getTasksByFilter
            .mockResolvedValueOnce({ results: [], nextCursor: null })
            .mockResolvedValueOnce({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'filter', 'show', 'Dashboard', '--ndjson'])

        const records = consoleSpy.mock.calls[0][0]
            .split('\n')
            .map((line: string) => JSON.parse(line))
        expect(records).toEqual([
            { query: 'today', results: [], nextCursor: null },
            { query: 'tomorrow', results: [], nextCursor: null },
        ])
    })

    it('does not split escaped commas in filter queries', async () => {
        const program = createProgram()
        captureConsole()

        mockFetchFilters.mockResolvedValue([
            makeFilter({
                id: 'filter-1',
                name: 'Dashboard',
                query: '#Research\\, Inc, today',
            }),
        ])
        mockApi.getTasksByFilter.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'filter', 'show', 'Dashboard', '--json'])

        expect(mockApi.getTasksByFilter).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ query: '#Research\\, Inc' }),
        )
        expect(mockApi.getTasksByFilter).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ query: 'today' }),
        )
    })

    it('rejects --cursor for filters with multiple sections', async () => {
        const program = createProgram()

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Dashboard', query: 'today, tomorrow' }),
        ])

        await expect(
            program.parseAsync([
                'node',
                'td',
                'filter',
                'show',
                'Dashboard',
                '--cursor',
                'next-page',
            ]),
        ).rejects.toHaveProperty('code', 'INVALID_OPTIONS')
        expect(mockApi.getTasksByFilter).not.toHaveBeenCalled()
    })

    it('shows "No tasks match this filter" when empty', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Empty', query: 'nonexistent' }),
        ])

        mockApi.getTasksByFilter.mockResolvedValue({
            results: [],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'filter', 'show', 'Empty'])

        expect(consoleSpy).toHaveBeenCalledWith('No tasks match this filter.')
    })

    it('outputs JSON with --json flag', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Work', query: '@work' }),
        ])

        mockApi.getTasksByFilter.mockResolvedValue({
            results: [
                {
                    id: 'task-1',
                    content: 'Task 1',
                    projectId: 'proj-1',
                    priority: 1,
                    labels: [],
                },
            ],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'filter', 'show', 'Work', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.results).toBeDefined()
        expect(parsed.results[0].content).toBe('Task 1')
    })

    it('shows filter by id: prefix', async () => {
        const program = createProgram()
        captureConsole()

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-123', name: 'Work', query: '@work' }),
        ])

        mockApi.getTasksByFilter.mockResolvedValue({
            results: [],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'filter', 'show', 'id:filter-123'])

        expect(mockApi.getTasksByFilter).toHaveBeenCalledWith(
            expect.objectContaining({ query: '@work' }),
        )
    })

    it('throws for non-existent filter', async () => {
        const program = createProgram()

        mockFetchFilters.mockResolvedValue([])

        await expect(
            program.parseAsync(['node', 'td', 'filter', 'show', 'nonexistent']),
        ).rejects.toHaveProperty('code', 'FILTER_NOT_FOUND')
    })

    it('resolves partial name match', async () => {
        const program = createProgram()
        captureConsole()

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Work Tasks', query: '@work' }),
        ])

        mockApi.getTasksByFilter.mockResolvedValue({
            results: [],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'filter', 'show', 'work'])

        expect(mockApi.getTasksByFilter).toHaveBeenCalledWith(
            expect.objectContaining({ query: '@work' }),
        )
    })

    it('throws for ambiguous partial match', async () => {
        const program = createProgram()

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Work Tasks', query: '@work' }),
            makeFilter({ id: 'filter-2', name: 'Work Projects', query: '#work' }),
        ])

        await expect(
            program.parseAsync(['node', 'td', 'filter', 'show', 'work']),
        ).rejects.toHaveProperty('code', 'AMBIGUOUS_FILTER')
    })

    it('throws INVALID_FILTER_QUERY for invalid filter syntax', async () => {
        const program = createProgram()

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Bad', query: '(((' }),
        ])

        mockApi.getTasksByFilter.mockRejectedValue(new Error('HTTP 400: Bad Request'))

        await expect(
            program.parseAsync(['node', 'td', 'filter', 'show', 'Bad']),
        ).rejects.toHaveProperty('code', 'INVALID_FILTER_QUERY')
    })
})

describe('filter show sorting', () => {
    let mockApi: MockApi

    const tasks = [
        { ...fixtures.tasks.basic, id: 'task-p4', content: 'Low', priority: 1 },
        { ...fixtures.tasks.basic, id: 'task-p1', content: 'Urgent', priority: 4 },
        { ...fixtures.tasks.basic, id: 'task-p3', content: 'Medium', priority: 2 },
    ]

    function makeViewOptions(overrides: Partial<SavedViewOptions>): SavedViewOptions {
        return {
            viewType: 'FILTER',
            objectId: 'filter-1',
            sortedBy: null,
            sortOrder: null,
            groupedBy: null,
            viewMode: 'LIST',
            isDeleted: false,
            ...overrides,
        } as SavedViewOptions
    }

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Work', query: '##work & p4 & !subtask' }),
        ])
        mockApi.getTasksByFilter.mockResolvedValue({ results: tasks, nextCursor: null })
        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work Project' }],
            nextCursor: null,
        })
    })

    function orderedIds(consoleSpy: ReturnType<typeof captureConsole>): string[] {
        const output = consoleSpy.mock.calls.map(([line]) => String(line)).join('\n')
        return tasks.map((task) => task.id).sort((a, b) => output.indexOf(a) - output.indexOf(b))
    }

    it('applies the Todoist default ordering when the view has no saved sort', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()
        mockApi.getViewOptions.mockResolvedValue([makeViewOptions({})])

        await program.parseAsync(['node', 'td', 'filter', 'show', 'Work', '--show-urls'])

        expect(orderedIds(consoleSpy)).toEqual(['task-p1', 'task-p3', 'task-p4'])
    })

    it('applies the sorting saved on the view in Todoist', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()
        mockApi.getViewOptions.mockResolvedValue([
            makeViewOptions({ sortedBy: 'ALPHABETICALLY', sortOrder: 'ASC' }),
        ])

        await program.parseAsync(['node', 'td', 'filter', 'show', 'Work', '--show-urls'])

        // Low, Medium, Urgent
        expect(orderedIds(consoleSpy)).toEqual(['task-p4', 'task-p3', 'task-p1'])
        const output = consoleSpy.mock.calls.map(([line]) => String(line)).join('\n')
        expect(output).toContain('Sort:  Name (A-Z)')
    })

    it('reads the sorting saved on a workspace filter view', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()
        mockApi.getViewOptions.mockResolvedValue([
            makeViewOptions({
                viewType: 'WORKSPACE_FILTER',
                sortedBy: 'PRIORITY',
                sortOrder: 'ASC',
            }),
        ])

        await program.parseAsync(['node', 'td', 'filter', 'show', 'Work', '--show-urls'])

        expect(orderedIds(consoleSpy)).toEqual(['task-p4', 'task-p3', 'task-p1'])
    })

    it('ignores view options saved for a different view', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()
        mockApi.getViewOptions.mockResolvedValue([
            makeViewOptions({ objectId: 'filter-2', sortedBy: 'ALPHABETICALLY' }),
            makeViewOptions({
                viewType: 'PROJECT',
                objectId: 'filter-1',
                sortedBy: 'ALPHABETICALLY',
            }),
        ])

        await program.parseAsync(['node', 'td', 'filter', 'show', 'Work', '--show-urls'])

        expect(orderedIds(consoleSpy)).toEqual(['task-p1', 'task-p3', 'task-p4'])
    })

    it('lets --sort override the saved sorting', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()
        mockApi.getViewOptions.mockResolvedValue([makeViewOptions({ sortedBy: 'PRIORITY' })])

        await program.parseAsync([
            'node',
            'td',
            'filter',
            'show',
            'Work',
            '--sort',
            'name',
            '--show-urls',
        ])

        expect(orderedIds(consoleSpy)).toEqual(['task-p4', 'task-p3', 'task-p1'])
        expect(mockApi.getViewOptions).not.toHaveBeenCalled()
    })

    it('lets --sort-order flip the saved sorting', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()
        mockApi.getViewOptions.mockResolvedValue([makeViewOptions({ sortedBy: 'PRIORITY' })])

        await program.parseAsync([
            'node',
            'td',
            'filter',
            'show',
            'Work',
            '--sort-order',
            'asc',
            '--show-urls',
        ])

        expect(orderedIds(consoleSpy)).toEqual(['task-p4', 'task-p3', 'task-p1'])
    })

    it('keeps the API order with --sort none', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync([
            'node',
            'td',
            'filter',
            'show',
            'Work',
            '--sort',
            'none',
            '--show-urls',
        ])

        expect(orderedIds(consoleSpy)).toEqual(['task-p4', 'task-p1', 'task-p3'])
    })

    it('sorts JSON output the same way', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync(['node', 'td', 'filter', 'show', 'Work', '--json'])

        const parsed = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(parsed.results.map((task: { id: string }) => task.id)).toEqual([
            'task-p1',
            'task-p3',
            'task-p4',
        ])
    })

    it('sorts each comma-separated section on its own', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()
        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Dashboard', query: 'today, @work' }),
        ])
        const dueSoon = {
            ...fixtures.tasks.basic,
            id: 'task-soon',
            content: 'Soon',
            priority: 1,
            due: { date: '2026-02-01', string: 'Feb 1', isRecurring: false },
        }
        const dueLater = {
            ...fixtures.tasks.basic,
            id: 'task-later',
            content: 'Later',
            priority: 4,
            due: { date: '2026-02-09', string: 'Feb 9', isRecurring: false },
        }
        mockApi.getTasksByFilter
            .mockResolvedValueOnce({ results: [dueLater, dueSoon], nextCursor: null })
            .mockResolvedValueOnce({ results: [dueSoon, dueLater], nextCursor: null })

        await program.parseAsync(['node', 'td', 'filter', 'show', 'Dashboard', '--json'])

        const parsed = JSON.parse(consoleSpy.mock.calls[0][0])
        // "today" is date-driven, so date wins; "@work" is not, so priority wins.
        expect(parsed.sections[0].results.map((task: { id: string }) => task.id)).toEqual([
            'task-soon',
            'task-later',
        ])
        expect(parsed.sections[1].results.map((task: { id: string }) => task.id)).toEqual([
            'task-later',
            'task-soon',
        ])
    })

    it('fetches projects in JSON mode so the order matches the pretty output', async () => {
        const program = createProgram()
        captureConsole()

        // Project order is the tie-break under every sort, so a name sort
        // needs the project list as much as the default hierarchy does.
        await program.parseAsync([
            'node',
            'td',
            'filter',
            'show',
            'Work',
            '--json',
            '--sort',
            'name',
        ])

        expect(mockApi.getProjects).toHaveBeenCalled()
    })

    it('rejects --cursor while a sort is active', async () => {
        const program = createProgram()
        captureConsole()

        await expect(
            program.parseAsync([
                'node',
                'td',
                'filter',
                'show',
                'Work',
                '--cursor',
                'abc',
                '--sort',
                'name',
            ]),
        ).rejects.toHaveProperty('code', 'INVALID_OPTIONS')
    })

    it('allows --cursor once sorting is off', async () => {
        const program = createProgram()
        captureConsole()

        await program.parseAsync([
            'node',
            'td',
            'filter',
            'show',
            'Work',
            '--cursor',
            'abc',
            '--sort',
            'none',
        ])

        expect(mockApi.getTasksByFilter).toHaveBeenCalledWith(
            expect.objectContaining({ cursor: 'abc' }),
        )
    })

    it('sorts the complete result set before applying the output limit', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()
        mockApi.getTasksByFilter
            .mockResolvedValueOnce({
                results: [
                    {
                        ...fixtures.tasks.basic,
                        id: 'task-low',
                        content: 'Low priority',
                        priority: 1,
                    },
                ],
                nextCursor: 'more',
            })
            .mockResolvedValueOnce({
                results: [
                    {
                        ...fixtures.tasks.basic,
                        id: 'task-urgent',
                        content: 'Urgent',
                        priority: 4,
                    },
                ],
                nextCursor: null,
            })

        await program.parseAsync(['node', 'td', 'filter', 'show', 'Work', '--json', '--limit', '1'])

        const parsed = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(parsed.results.map((task: { id: string }) => task.id)).toEqual(['task-urgent'])
        expect(parsed.nextCursor).toBeNull()
        expect(mockApi.getTasksByFilter).toHaveBeenCalledTimes(2)
    })

    it('sorts with the account timezone rather than the machine one', async () => {
        const program = createProgram()
        captureConsole()

        await program.parseAsync(['node', 'td', 'filter', 'show', 'Work', '--json'])

        expect(mockAccountTimezone).toHaveBeenCalled()
    })

    it('does not look up the timezone when nothing is sorted', async () => {
        const program = createProgram()
        captureConsole()

        await program.parseAsync([
            'node',
            'td',
            'filter',
            'show',
            'Work',
            '--json',
            '--sort',
            'none',
        ])

        expect(mockAccountTimezone).not.toHaveBeenCalled()
    })

    it('skips the project fetch when nothing is sorted', async () => {
        const program = createProgram()
        captureConsole()

        await program.parseAsync([
            'node',
            'td',
            'filter',
            'show',
            'Work',
            '--json',
            '--sort',
            'none',
        ])

        expect(mockApi.getProjects).not.toHaveBeenCalled()
    })

    it('still renders when the saved view options cannot be read', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()
        mockApi.getViewOptions.mockRejectedValue(new Error('boom'))

        await program.parseAsync(['node', 'td', 'filter', 'show', 'Work', '--show-urls'])

        expect(orderedIds(consoleSpy)).toEqual(['task-p1', 'task-p3', 'task-p4'])
        const output = consoleSpy.mock.calls.map(([line]) => String(line)).join('\n')
        // The list still renders, but it doesn't claim to be the view's sorting.
        expect(output).toContain('saved view options unavailable')
    })
})

describe('filter view (alias)', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('works via "view" subcommand', async () => {
        const program = createProgram()
        captureConsole()

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Work', query: '@work' }),
        ])

        mockApi.getTasksByFilter.mockResolvedValue({
            results: [],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'filter', 'view', 'Work'])

        expect(mockApi.getTasksByFilter).toHaveBeenCalledWith(
            expect.objectContaining({ query: '@work' }),
        )
    })

    it('defaults to view subcommand (td filter <ref>)', async () => {
        const program = createProgram()
        captureConsole()

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Work', query: '@work' }),
        ])

        mockApi.getTasksByFilter.mockResolvedValue({
            results: [],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'filter', 'Work'])

        expect(mockApi.getTasksByFilter).toHaveBeenCalledWith(
            expect.objectContaining({ query: '@work' }),
        )
    })
})

describe('filter URL resolution', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('resolves filter by URL in view command', async () => {
        const program = createProgram()
        captureConsole()

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter1', name: 'Work', query: '@work' }),
        ])

        mockApi.getTasksByFilter.mockResolvedValue({
            results: [],
            nextCursor: null,
        })

        await program.parseAsync([
            'node',
            'td',
            'filter',
            'view',
            'https://app.todoist.com/app/filter/work-filter1',
        ])

        expect(mockApi.getTasksByFilter).toHaveBeenCalledWith(
            expect.objectContaining({ query: '@work' }),
        )
    })

    it('resolves filter by URL in delete command', async () => {
        const program = createProgram()
        captureConsole()

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter1', name: 'Work', query: '@work' }),
        ])
        mockDeleteFilter.mockResolvedValue(undefined)

        await program.parseAsync([
            'node',
            'td',
            'filter',
            'delete',
            'https://app.todoist.com/app/filter/work-filter1',
            '--yes',
        ])

        expect(mockDeleteFilter).toHaveBeenCalledWith('filter1')
    })

    it('throws entity type mismatch for task URL in filter command', async () => {
        const program = createProgram()

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Work', query: '@work' }),
        ])

        await expect(
            program.parseAsync([
                'node',
                'td',
                'filter',
                'delete',
                'https://app.todoist.com/app/task/buy-milk-task1',
                '--yes',
            ]),
        ).rejects.toThrow('Expected a filter URL, but got a task URL')
    })
})

describe('filter (no args)', () => {
    it('shows parent help listing all subcommands', async () => {
        const program = createProgram()
        const stdoutSpy = captureStream()

        try {
            await program.parseAsync(['node', 'td', 'filter'])
        } catch (err: unknown) {
            if ((err as { code?: string }).code !== 'commander.help') throw err
        }

        const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
        expect(output).toContain('list')
        expect(output).toContain('create')
        expect(output).toContain('delete')
        expect(output).toContain('update')
        expect(output).toContain('view')
    })
})

describe('filter --dry-run', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('filter create --dry-run previews without calling API', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync([
            'node',
            'td',
            'filter',
            'create',
            '--name',
            'Work',
            '--query',
            '#Work',
            '--dry-run',
        ])

        expect(mockAddFilter).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would create filter'))
    })

    it('filter delete --dry-run previews without calling API', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Work', query: '#Work' }),
        ])

        await program.parseAsync(['node', 'td', 'filter', 'delete', 'Work', '--dry-run'])

        expect(mockDeleteFilter).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would delete filter'))
    })

    it('filter update --dry-run previews without calling API', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Work', query: '#Work' }),
        ])

        await program.parseAsync([
            'node',
            'td',
            'filter',
            'update',
            'Work',
            '--name',
            'Work Tasks',
            '--dry-run',
        ])

        expect(mockUpdateFilter).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would update filter'))
    })
})
