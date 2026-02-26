import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api/core.js', () => ({
    getApi: vi.fn(),
}))

vi.mock('../lib/api/filters.js', () => ({
    fetchFilters: vi.fn(),
    addFilter: vi.fn(),
    updateFilter: vi.fn(),
    deleteFilter: vi.fn(),
}))

import { registerFilterCommand } from '../commands/filter.js'
import { getApi } from '../lib/api/core.js'
import { addFilter, deleteFilter, fetchFilters, updateFilter } from '../lib/api/filters.js'
import { makeFilter } from './helpers/fixtures.js'
import { createMockApi, type MockApi } from './helpers/mock-api.js'

const mockGetApi = vi.mocked(getApi)
const mockFetchFilters = vi.mocked(fetchFilters)
const mockAddFilter = vi.mocked(addFilter)
const mockUpdateFilter = vi.mocked(updateFilter)
const mockDeleteFilter = vi.mocked(deleteFilter)

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerFilterCommand(program)
    return program
}

describe('filter list', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('lists all filters', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Work tasks', query: '@work' }),
            makeFilter({ id: 'filter-2', name: 'Urgent', query: 'p1', isFavorite: true }),
        ])

        await program.parseAsync(['node', 'td', 'filter', 'list'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Work tasks'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Urgent'))
        consoleSpy.mockRestore()
    })

    it('shows "No filters found" when empty', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchFilters.mockResolvedValue([])

        await program.parseAsync(['node', 'td', 'filter', 'list'])

        expect(consoleSpy).toHaveBeenCalledWith('No filters found.')
        consoleSpy.mockRestore()
    })

    it('outputs JSON with --json flag', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Work', query: '@work' }),
        ])

        await program.parseAsync(['node', 'td', 'filter', 'list', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.results).toBeDefined()
        expect(parsed.results[0].name).toBe('Work')
        consoleSpy.mockRestore()
    })

    it('outputs NDJSON with --ndjson flag', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Work', query: '@work' }),
            makeFilter({ id: 'filter-2', name: 'Home', query: '@home' }),
        ])

        await program.parseAsync(['node', 'td', 'filter', 'list', '--ndjson'])

        const output = consoleSpy.mock.calls[0][0]
        const lines = output.split('\n')
        expect(lines).toHaveLength(2)
        consoleSpy.mockRestore()
    })
})

describe('filter create', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('creates filter with name and query', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

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
        consoleSpy.mockRestore()
    })

    it('creates filter with --color', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

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
        consoleSpy.mockRestore()
    })

    it('creates filter with --favorite', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

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
        consoleSpy.mockRestore()
    })

    it('shows filter ID after creation', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

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
        consoleSpy.mockRestore()
    })
})

describe('filter delete', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('shows dry-run without --yes', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Work', query: '@work' }),
        ])

        await program.parseAsync(['node', 'td', 'filter', 'delete', 'Work'])

        expect(mockDeleteFilter).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith('Would delete: Work')
        expect(consoleSpy).toHaveBeenCalledWith('Use --yes to confirm.')
        consoleSpy.mockRestore()
    })

    it('deletes by name with --yes', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Work', query: '@work' }),
        ])
        mockDeleteFilter.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'filter', 'delete', 'Work', '--yes'])

        expect(mockDeleteFilter).toHaveBeenCalledWith('filter-1')
        expect(consoleSpy).toHaveBeenCalledWith('Deleted: Work')
        consoleSpy.mockRestore()
    })

    it('deletes by id: prefix with --yes', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-123', name: 'Work', query: '@work' }),
        ])
        mockDeleteFilter.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'filter', 'delete', 'id:filter-123', '--yes'])

        expect(mockDeleteFilter).toHaveBeenCalledWith('filter-123')
        consoleSpy.mockRestore()
    })

    it('throws for non-existent filter', async () => {
        const program = createProgram()

        mockFetchFilters.mockResolvedValue([])

        await expect(
            program.parseAsync(['node', 'td', 'filter', 'delete', 'nonexistent', '--yes']),
        ).rejects.toThrow('FILTER_NOT_FOUND')
    })
})

describe('filter update', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('updates filter name', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

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
        expect(consoleSpy).toHaveBeenCalledWith('Updated: Old Name -> New Name')
        consoleSpy.mockRestore()
    })

    it('updates filter query', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

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
        consoleSpy.mockRestore()
    })

    it('updates filter color and favorite', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

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
        consoleSpy.mockRestore()
    })

    it('removes favorite with --no-favorite', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Work', query: '@work', isFavorite: true }),
        ])
        mockUpdateFilter.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'filter', 'update', 'Work', '--no-favorite'])

        expect(mockUpdateFilter).toHaveBeenCalledWith('filter-1', {
            isFavorite: false,
        })
        consoleSpy.mockRestore()
    })

    it('updates by id: prefix', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

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
        consoleSpy.mockRestore()
    })

    it('throws when no changes specified', async () => {
        const program = createProgram()

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Work', query: '@work' }),
        ])

        await expect(
            program.parseAsync(['node', 'td', 'filter', 'update', 'Work']),
        ).rejects.toThrow('NO_CHANGES')
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
        ).rejects.toThrow('FILTER_NOT_FOUND')
    })
})

describe('filter show', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('shows tasks matching filter', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

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
        consoleSpy.mockRestore()
    })

    it('shows "No tasks match this filter" when empty', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Empty', query: 'nonexistent' }),
        ])

        mockApi.getTasksByFilter.mockResolvedValue({
            results: [],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'filter', 'show', 'Empty'])

        expect(consoleSpy).toHaveBeenCalledWith('No tasks match this filter.')
        consoleSpy.mockRestore()
    })

    it('outputs JSON with --json flag', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

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
        consoleSpy.mockRestore()
    })

    it('shows filter by id: prefix', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

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
        consoleSpy.mockRestore()
    })

    it('throws for non-existent filter', async () => {
        const program = createProgram()

        mockFetchFilters.mockResolvedValue([])

        await expect(
            program.parseAsync(['node', 'td', 'filter', 'show', 'nonexistent']),
        ).rejects.toThrow('FILTER_NOT_FOUND')
    })

    it('resolves partial name match', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

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
        consoleSpy.mockRestore()
    })

    it('throws for ambiguous partial match', async () => {
        const program = createProgram()

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Work Tasks', query: '@work' }),
            makeFilter({ id: 'filter-2', name: 'Work Projects', query: '#work' }),
        ])

        await expect(program.parseAsync(['node', 'td', 'filter', 'show', 'work'])).rejects.toThrow(
            'AMBIGUOUS_FILTER',
        )
    })

    it('throws INVALID_FILTER_QUERY for invalid filter syntax', async () => {
        const program = createProgram()

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Bad', query: '(((' }),
        ])

        mockApi.getTasksByFilter.mockRejectedValue(new Error('HTTP 400: Bad Request'))

        await expect(program.parseAsync(['node', 'td', 'filter', 'show', 'Bad'])).rejects.toThrow(
            'INVALID_FILTER_QUERY',
        )
    })
})

describe('filter view (alias)', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('works via "view" subcommand', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

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
        consoleSpy.mockRestore()
    })

    it('defaults to view subcommand (td filter <ref>)', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

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
        consoleSpy.mockRestore()
    })
})

describe('filter URL resolution', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('resolves filter by URL in view command', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

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
        consoleSpy.mockRestore()
    })

    it('resolves filter by URL in delete command', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

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
        consoleSpy.mockRestore()
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
