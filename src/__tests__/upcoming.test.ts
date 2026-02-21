import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api/core.js', () => ({
    getApi: vi.fn(),
    getCurrentUserId: vi.fn().mockResolvedValue('current-user-123'),
    isWorkspaceProject: vi.fn().mockReturnValue(false),
}))

import { registerUpcomingCommand } from '../commands/upcoming.js'
import { getApi } from '../lib/api/core.js'
import { createMockApi, type MockApi } from './helpers/mock-api.js'

const mockGetApi = vi.mocked(getApi)

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerUpcomingCommand(program)
    return program
}

function getDateOffset(days: number): string {
    const d = new Date()
    d.setDate(d.getDate() + days)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('upcoming command', () => {
    let mockApi: MockApi
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

    it('defaults to 7 days', async () => {
        const program = createProgram()

        mockApi.getTasksByFilter.mockResolvedValue({
            results: [
                {
                    id: 'task-1',
                    content: 'Task in range',
                    projectId: 'proj-1',
                    due: { date: getDateOffset(3) },
                },
            ],
            nextCursor: null,
        })
        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'upcoming'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Task in range'))
        expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Task out of range'))
    })

    it('accepts custom days argument', async () => {
        const program = createProgram()

        mockApi.getTasksByFilter.mockResolvedValue({
            results: [
                {
                    id: 'task-1',
                    content: 'Task day 2',
                    projectId: 'proj-1',
                    due: { date: getDateOffset(2) },
                },
            ],
            nextCursor: null,
        })
        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'upcoming', '3'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Task day 2'))
        expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Task day 5'))
    })

    it('always includes overdue tasks', async () => {
        const program = createProgram()

        mockApi.getTasksByFilter.mockResolvedValue({
            results: [
                {
                    id: 'task-1',
                    content: 'Overdue task',
                    projectId: 'proj-1',
                    due: { date: getDateOffset(-2) },
                },
            ],
            nextCursor: null,
        })
        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'upcoming', '3'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Overdue'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Overdue task'))
    })

    it('shows Today header for today tasks', async () => {
        const program = createProgram()

        mockApi.getTasksByFilter.mockResolvedValue({
            results: [
                {
                    id: 'task-1',
                    content: 'Today task',
                    projectId: 'proj-1',
                    due: { date: getDateOffset(0) },
                },
            ],
            nextCursor: null,
        })
        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'upcoming'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Today'))
    })

    it('shows Tomorrow header for tomorrow tasks', async () => {
        const program = createProgram()

        mockApi.getTasksByFilter.mockResolvedValue({
            results: [
                {
                    id: 'task-1',
                    content: 'Tomorrow task',
                    projectId: 'proj-1',
                    due: { date: getDateOffset(1) },
                },
            ],
            nextCursor: null,
        })
        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'upcoming'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Tomorrow'))
    })

    it('shows empty message when no tasks', async () => {
        const program = createProgram()

        mockApi.getTasksByFilter.mockResolvedValue({ results: [], nextCursor: null })
        mockApi.getProjects.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'upcoming'])

        expect(consoleSpy).toHaveBeenCalledWith('No tasks due in the next 7 days.')
    })

    it('shows singular "day" for 1 day', async () => {
        const program = createProgram()

        mockApi.getTasksByFilter.mockResolvedValue({ results: [], nextCursor: null })
        mockApi.getProjects.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'upcoming', '1'])

        expect(consoleSpy).toHaveBeenCalledWith('No tasks due in the next 1 day.')
    })

    it('outputs JSON with --json flag', async () => {
        const program = createProgram()

        mockApi.getTasksByFilter.mockResolvedValue({
            results: [
                {
                    id: 'task-1',
                    content: 'Task',
                    projectId: 'proj-1',
                    due: { date: getDateOffset(1) },
                },
            ],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'upcoming', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.results).toBeDefined()
        expect(parsed.results[0].content).toBe('Task')
    })

    it('outputs NDJSON with --ndjson flag', async () => {
        const program = createProgram()

        mockApi.getTasksByFilter.mockResolvedValue({
            results: [
                {
                    id: 'task-1',
                    content: 'Task 1',
                    projectId: 'proj-1',
                    due: { date: getDateOffset(0) },
                },
                {
                    id: 'task-2',
                    content: 'Task 2',
                    projectId: 'proj-1',
                    due: { date: getDateOffset(1) },
                },
            ],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'upcoming', '--ndjson'])

        const output = consoleSpy.mock.calls[0][0]
        const lines = output.split('\n')
        expect(lines).toHaveLength(2)
    })

    it('groups tasks by date with counts', async () => {
        const program = createProgram()

        mockApi.getTasksByFilter.mockResolvedValue({
            results: [
                {
                    id: 'task-1',
                    content: 'Task 1',
                    projectId: 'proj-1',
                    due: { date: getDateOffset(0) },
                },
                {
                    id: 'task-2',
                    content: 'Task 2',
                    projectId: 'proj-1',
                    due: { date: getDateOffset(0) },
                },
            ],
            nextCursor: null,
        })
        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'upcoming'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Today (2)'))
    })

    it('rejects invalid days argument', async () => {
        const program = createProgram()
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        await program.parseAsync(['node', 'td', 'upcoming', 'invalid'])

        expect(errorSpy).toHaveBeenCalledWith('Days must be a positive number')
        errorSpy.mockRestore()
    })

    it('uses server-side assignee scoping by default', async () => {
        const program = createProgram()

        mockApi.getTasksByFilter.mockResolvedValue({ results: [], nextCursor: null })
        mockApi.getProjects.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'upcoming'])

        expect(mockApi.getTasksByFilter).toHaveBeenCalledWith(
            expect.objectContaining({
                query: '(due before: 7 days) & (assigned to: me | !assigned)',
            }),
        )
    })

    it('uses broad query with --any-assignee', async () => {
        const program = createProgram()

        mockApi.getTasksByFilter.mockResolvedValue({ results: [], nextCursor: null })
        mockApi.getProjects.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'upcoming', '--any-assignee'])

        expect(mockApi.getTasksByFilter).toHaveBeenCalledWith(
            expect.objectContaining({
                query: 'due before: 7 days',
            }),
        )
    })

    it('--any-assignee includes tasks assigned to others', async () => {
        const program = createProgram()

        mockApi.getTasksByFilter.mockResolvedValue({
            results: [
                {
                    id: 'task-1',
                    content: 'My task',
                    projectId: 'proj-1',
                    responsibleUid: 'current-user-123',
                    due: { date: getDateOffset(1) },
                },
                {
                    id: 'task-2',
                    content: 'Other task',
                    projectId: 'proj-1',
                    responsibleUid: 'other-user-456',
                    due: { date: getDateOffset(1) },
                },
            ],
            nextCursor: null,
        })
        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'upcoming', '--any-assignee'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('My task'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Other task'))
    })

    it('uses custom days in server-side scoped query', async () => {
        const program = createProgram()

        mockApi.getTasksByFilter.mockResolvedValue({ results: [], nextCursor: null })
        mockApi.getProjects.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'upcoming', '14'])

        expect(mockApi.getTasksByFilter).toHaveBeenCalledWith(
            expect.objectContaining({
                query: '(due before: 14 days) & (assigned to: me | !assigned)',
            }),
        )
    })
})
