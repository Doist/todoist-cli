import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api/core.js', () => ({
    getApi: vi.fn(),
    getCurrentUserId: vi.fn().mockResolvedValue('current-user-123'),
    isWorkspaceProject: vi.fn(
        (project: { workspaceId?: string }) => project.workspaceId !== undefined,
    ),
}))

vi.mock('../lib/api/workspaces.js', () => ({
    fetchWorkspaces: vi.fn().mockResolvedValue([]),
}))

import { registerTodayCommand } from '../commands/today.js'
import { getApi } from '../lib/api/core.js'
import { fetchWorkspaces, type Workspace } from '../lib/api/workspaces.js'

const mockGetApi = vi.mocked(getApi)
const mockFetchWorkspaces = vi.mocked(fetchWorkspaces)

function createMockApi() {
    return {
        getTasks: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        getProjects: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
    }
}

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerTodayCommand(program)
    return program
}

function getToday(): string {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function getYesterday(): string {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('today command', () => {
    let mockApi: ReturnType<typeof createMockApi>
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
        consoleSpy.mockRestore()
    })

    it('shows overdue tasks in Overdue section', async () => {
        const program = createProgram()

        mockApi.getTasks.mockResolvedValue({
            results: [
                {
                    id: 'task-1',
                    content: 'Overdue task',
                    projectId: 'proj-1',
                    due: { date: getYesterday(), string: 'yesterday' },
                },
            ],
            nextCursor: null,
        })
        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'today'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Overdue'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Overdue task'))
    })

    it('shows tasks due today in Today section', async () => {
        const program = createProgram()

        mockApi.getTasks.mockResolvedValue({
            results: [
                {
                    id: 'task-1',
                    content: 'Today task',
                    projectId: 'proj-1',
                    due: { date: getToday(), string: 'today' },
                },
            ],
            nextCursor: null,
        })
        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'today'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Today'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Today task'))
    })

    it('includes tasks with specific times in today section', async () => {
        const program = createProgram()

        mockApi.getTasks.mockResolvedValue({
            results: [
                {
                    id: 'task-1',
                    content: 'Meeting at 6pm',
                    projectId: 'proj-1',
                    due: { date: `${getToday()}T18:00:00`, string: 'today at 6pm' },
                },
                {
                    id: 'task-2',
                    content: 'Deadline at 9am',
                    projectId: 'proj-1',
                    due: { date: `${getToday()}T09:00:00`, string: 'today at 9am' },
                },
            ],
            nextCursor: null,
        })
        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'today'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Today'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Meeting at 6pm'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Deadline at 9am'))
    })

    it('shows "No tasks due today" when empty', async () => {
        const program = createProgram()

        mockApi.getTasks.mockResolvedValue({ results: [], nextCursor: null })
        mockApi.getProjects.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'today'])

        expect(consoleSpy).toHaveBeenCalledWith('No tasks due today.')
    })

    it('excludes tasks with future due dates', async () => {
        const program = createProgram()

        mockApi.getTasks.mockResolvedValue({
            results: [
                {
                    id: 'task-1',
                    content: 'Future task',
                    projectId: 'proj-1',
                    due: { date: '2099-12-31', string: 'Dec 31' },
                },
            ],
            nextCursor: null,
        })
        mockApi.getProjects.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'today'])

        expect(consoleSpy).toHaveBeenCalledWith('No tasks due today.')
    })

    it('outputs JSON with --json flag', async () => {
        const program = createProgram()

        mockApi.getTasks.mockResolvedValue({
            results: [
                {
                    id: 'task-1',
                    content: 'Today task',
                    projectId: 'proj-1',
                    due: { date: getToday() },
                },
            ],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'today', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.results).toBeDefined()
        expect(parsed.results[0].content).toBe('Today task')
    })

    it('outputs NDJSON with --ndjson flag', async () => {
        const program = createProgram()

        mockApi.getTasks.mockResolvedValue({
            results: [
                {
                    id: 'task-1',
                    content: 'Task 1',
                    projectId: 'proj-1',
                    due: { date: getToday() },
                },
                {
                    id: 'task-2',
                    content: 'Task 2',
                    projectId: 'proj-1',
                    due: { date: getYesterday() },
                },
            ],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'today', '--ndjson'])

        const output = consoleSpy.mock.calls[0][0]
        const lines = output.split('\n')
        expect(lines).toHaveLength(2)
    })

    it('includes project names in output', async () => {
        const program = createProgram()

        mockApi.getTasks.mockResolvedValue({
            results: [
                {
                    id: 'task-1',
                    content: 'Task',
                    projectId: 'proj-1',
                    due: { date: getToday() },
                },
            ],
            nextCursor: null,
        })
        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'today'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Work'))
    })

    it('filters by --personal to show only personal project tasks', async () => {
        const program = createProgram()

        mockApi.getTasks.mockResolvedValue({
            results: [
                {
                    id: 'task-1',
                    content: 'Personal task',
                    projectId: 'proj-personal',
                    due: { date: getToday() },
                },
                {
                    id: 'task-2',
                    content: 'Workspace task',
                    projectId: 'proj-workspace',
                    due: { date: getToday() },
                },
            ],
            nextCursor: null,
        })
        mockApi.getProjects.mockResolvedValue({
            results: [
                { id: 'proj-personal', name: 'Personal' },
                { id: 'proj-workspace', name: 'Work', workspaceId: 'ws-1' },
            ],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'today', '--personal'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Personal task'))
        expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Workspace task'))
    })

    it('filters by --workspace to show only workspace tasks', async () => {
        const program = createProgram()

        mockApi.getTasks.mockResolvedValue({
            results: [
                {
                    id: 'task-1',
                    content: 'Personal task',
                    projectId: 'proj-personal',
                    due: { date: getToday() },
                },
                {
                    id: 'task-2',
                    content: 'Workspace task',
                    projectId: 'proj-workspace',
                    due: { date: getToday() },
                },
            ],
            nextCursor: null,
        })
        mockApi.getProjects.mockResolvedValue({
            results: [
                { id: 'proj-personal', name: 'Personal' },
                { id: 'proj-workspace', name: 'Work', workspaceId: 'ws-1' },
            ],
            nextCursor: null,
        })
        mockFetchWorkspaces.mockResolvedValue([
            { id: 'ws-1', name: 'Acme Corp' } as Partial<Workspace>,
        ] as Workspace[])

        await program.parseAsync(['node', 'td', 'today', '--workspace', 'Acme'])

        expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Personal task'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Workspace task'))
    })

    it('throws error when both --workspace and --personal specified', async () => {
        const program = createProgram()

        mockApi.getTasks.mockResolvedValue({ results: [], nextCursor: null })

        await expect(
            program.parseAsync(['node', 'td', 'today', '--workspace', 'Acme', '--personal']),
        ).rejects.toThrow('mutually exclusive')
    })
})
