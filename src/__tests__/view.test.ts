import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api/core.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../lib/api/core.js')>()
    return {
        ...actual,
        getApi: vi.fn(),
        isWorkspaceProject: vi.fn(
            (project: { workspaceId?: string }) => project.workspaceId !== undefined,
        ),
    }
})

vi.mock('../lib/api/workspaces.js', () => ({
    fetchWorkspaces: vi.fn().mockResolvedValue([]),
    fetchWorkspaceFolders: vi.fn().mockResolvedValue([]),
}))

vi.mock('../lib/api/filters.js', () => ({
    fetchFilters: vi.fn().mockResolvedValue([]),
}))

vi.mock('../lib/browser.js', () => ({
    openInBrowser: vi.fn(),
}))

import { registerViewCommand } from '../commands/view.js'
import { getApi } from '../lib/api/core.js'
import { fetchFilters } from '../lib/api/filters.js'

const mockGetApi = vi.mocked(getApi)
const mockFetchFilters = vi.mocked(fetchFilters)

function createMockApi() {
    return {
        getTasks: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        getTask: vi.fn(),
        getTasksByFilter: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        getProjects: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        getProject: vi.fn(),
        getLabels: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        getSections: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
    }
}

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerViewCommand(program)
    return program
}

describe('view command', () => {
    let mockApi: ReturnType<typeof createMockApi>
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    it('routes task URL to task view', async () => {
        const program = createProgram()

        mockApi.getTask.mockResolvedValue({
            id: 'task1',
            content: 'Buy milk',
            description: '',
            priority: 1,
            projectId: 'proj1',
            sectionId: null,
            parentId: null,
            labels: [],
            due: null,
            checked: false,
        })
        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj1', name: 'Inbox' }],
            nextCursor: null,
        })
        mockApi.getTasks.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync([
            'node',
            'td',
            'view',
            'https://app.todoist.com/app/task/buy-milk-task1',
        ])

        expect(mockApi.getTask).toHaveBeenCalledWith('task1')
    })

    it('routes project URL to project view', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({
            id: 'proj1',
            name: 'Work',
            color: 'blue',
            isFavorite: false,
            isShared: false,
        })
        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj1', name: 'Work', color: 'blue' }],
            nextCursor: null,
        })
        mockApi.getTasks.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync([
            'node',
            'td',
            'view',
            'https://app.todoist.com/app/project/work-proj1',
        ])

        expect(mockApi.getProject).toHaveBeenCalledWith('proj1')
    })

    it('routes label URL to label view', async () => {
        const program = createProgram()

        mockApi.getLabels.mockResolvedValue({
            results: [{ id: 'label1', name: 'urgent', color: 'red', isFavorite: false }],
            nextCursor: null,
        })

        await program.parseAsync([
            'node',
            'td',
            'view',
            'https://app.todoist.com/app/label/urgent-label1',
        ])

        expect(mockApi.getLabels).toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('urgent'))
    })

    it('routes filter URL to filter view', async () => {
        const program = createProgram()

        mockFetchFilters.mockResolvedValue([
            { id: 'filter1', name: 'Work tasks', query: '#Work', color: 'blue', isFavorite: false },
        ])

        await program.parseAsync([
            'node',
            'td',
            'view',
            'https://app.todoist.com/app/filter/work-tasks-filter1',
        ])

        expect(mockFetchFilters).toHaveBeenCalled()
    })

    it('routes today URL to today view', async () => {
        const program = createProgram()

        await program.parseAsync(['node', 'td', 'view', 'https://app.todoist.com/app/today'])

        expect(mockApi.getTasksByFilter).toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith('No tasks due today.')
    })

    it('routes upcoming URL to upcoming view', async () => {
        const program = createProgram()

        await program.parseAsync(['node', 'td', 'view', 'https://app.todoist.com/app/upcoming'])

        expect(mockApi.getTasksByFilter).toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith('No tasks due in the next 7 days.')
    })

    it('rejects invalid URLs', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'td', 'view', 'https://example.com/not-todoist']),
        ).rejects.toThrow('Not a recognized Todoist URL')
    })

    it('passes --json option to entity views', async () => {
        const program = createProgram()

        mockApi.getTask.mockResolvedValue({
            id: 'task1',
            content: 'Buy milk',
            description: '',
            priority: 1,
            projectId: 'proj1',
            sectionId: null,
            parentId: null,
            labels: [],
            due: null,
            checked: false,
        })

        await program.parseAsync([
            'node',
            'td',
            'view',
            'https://app.todoist.com/app/task/buy-milk-task1',
            '--json',
        ])

        expect(mockApi.getTask).toHaveBeenCalledWith('task1')
        // JSON output should be produced
        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('"id"')
    })
})
