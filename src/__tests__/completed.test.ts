import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api/core.js', () => ({
    getApi: vi.fn(),
    isWorkspaceProject: vi.fn(
        (project: { workspaceId?: string }) => project.workspaceId !== undefined,
    ),
}))

import { registerCompletedCommand } from '../commands/completed.js'
import { getApi } from '../lib/api/core.js'
import { createMockApi, type MockApi } from './helpers/mock-api.js'

const mockGetApi = vi.mocked(getApi)

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerCompletedCommand(program)
    return program
}

function getToday(): string {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function getTomorrow(): string {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('completed command', () => {
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

    it('shows completed tasks', async () => {
        const program = createProgram()

        mockApi.getCompletedTasksByCompletionDate.mockResolvedValue({
            items: [
                {
                    id: 'task-1',
                    content: 'Completed task',
                    projectId: 'proj-1',
                    priority: 1,
                },
            ],
            nextCursor: null,
        })
        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'completed'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Completed'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Completed task'))
    })

    it('uses today as default since date', async () => {
        const program = createProgram()

        await program.parseAsync(['node', 'td', 'completed'])

        expect(mockApi.getCompletedTasksByCompletionDate).toHaveBeenCalledWith(
            expect.objectContaining({
                since: getToday(),
                until: getTomorrow(),
            }),
        )
    })

    it('accepts custom date range', async () => {
        const program = createProgram()

        await program.parseAsync([
            'node',
            'td',
            'completed',
            '--since',
            '2024-01-01',
            '--until',
            '2024-01-08',
        ])

        expect(mockApi.getCompletedTasksByCompletionDate).toHaveBeenCalledWith(
            expect.objectContaining({
                since: '2024-01-01',
                until: '2024-01-08',
            }),
        )
    })

    it('shows "No completed tasks" when empty', async () => {
        const program = createProgram()

        mockApi.getCompletedTasksByCompletionDate.mockResolvedValue({
            items: [],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'completed'])

        expect(consoleSpy).toHaveBeenCalledWith('No completed tasks in this period.')
    })

    it('filters by project', async () => {
        const program = createProgram()

        mockApi.getProjects = vi.fn().mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })
        mockApi.getCompletedTasksByCompletionDate.mockResolvedValue({
            items: [],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'completed', '--project', 'Work'])

        expect(mockApi.getCompletedTasksByCompletionDate).toHaveBeenCalledWith(
            expect.objectContaining({
                projectId: 'proj-1',
            }),
        )
    })

    it('outputs JSON with --json flag', async () => {
        const program = createProgram()

        mockApi.getCompletedTasksByCompletionDate.mockResolvedValue({
            items: [{ id: 'task-1', content: 'Done task', projectId: 'proj-1' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'completed', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.results).toBeDefined()
        expect(parsed.results[0].content).toBe('Done task')
    })

    it('outputs NDJSON with --ndjson flag', async () => {
        const program = createProgram()

        mockApi.getCompletedTasksByCompletionDate.mockResolvedValue({
            items: [
                { id: 'task-1', content: 'Task 1', projectId: 'proj-1' },
                { id: 'task-2', content: 'Task 2', projectId: 'proj-1' },
            ],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'completed', '--ndjson'])

        const output = consoleSpy.mock.calls[0][0]
        const lines = output.split('\n')
        expect(lines).toHaveLength(2)
    })

    it('includes project names in text output', async () => {
        const program = createProgram()

        mockApi.getCompletedTasksByCompletionDate.mockResolvedValue({
            items: [{ id: 'task-1', content: 'Task', projectId: 'proj-1', priority: 1 }],
            nextCursor: null,
        })
        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'completed'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Work'))
    })

    it('respects --limit option', async () => {
        const program = createProgram()

        await program.parseAsync(['node', 'td', 'completed', '--limit', '10'])

        expect(mockApi.getCompletedTasksByCompletionDate).toHaveBeenCalledWith(
            expect.objectContaining({
                limit: 10,
            }),
        )
    })

    it('displays assignee for shared project tasks', async () => {
        const program = createProgram()

        mockApi.getCompletedTasksByCompletionDate.mockResolvedValue({
            items: [
                {
                    id: 'task-1',
                    content: 'Assigned task',
                    projectId: 'proj-shared',
                    priority: 1,
                    responsibleUid: 'user-123',
                },
            ],
            nextCursor: null,
        })
        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-shared', name: 'Shared Project', isShared: true }],
            nextCursor: null,
        })
        mockApi.getProjectCollaborators.mockResolvedValue({
            results: [{ id: 'user-123', name: 'Alice Smith', email: 'alice@example.com' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'completed'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('+Alice S.'))
    })

    it('displays assignee for workspace project tasks', async () => {
        const program = createProgram()

        mockApi.getCompletedTasksByCompletionDate.mockResolvedValue({
            items: [
                {
                    id: 'task-1',
                    content: 'Workspace task',
                    projectId: 'proj-ws',
                    priority: 1,
                    responsibleUid: 'user-456',
                },
            ],
            nextCursor: null,
        })
        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-ws', name: 'Team Project', workspaceId: 'ws-1' }],
            nextCursor: null,
        })
        mockApi.getWorkspaceUsers.mockResolvedValue({
            workspaceUsers: [
                { userId: 'user-456', fullName: 'Bob Jones', userEmail: 'bob@example.com' },
            ],
            hasMore: false,
        })

        await program.parseAsync(['node', 'td', 'completed'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('+Bob J.'))
    })

    it('does not fetch collaborators when no tasks have assignees', async () => {
        const program = createProgram()

        mockApi.getCompletedTasksByCompletionDate.mockResolvedValue({
            items: [
                {
                    id: 'task-1',
                    content: 'Unassigned task',
                    projectId: 'proj-1',
                    priority: 1,
                    responsibleUid: null,
                },
            ],
            nextCursor: null,
        })
        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work', isShared: true }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'completed'])

        expect(mockApi.getProjectCollaborators).not.toHaveBeenCalled()
        expect(mockApi.getWorkspaceUsers).not.toHaveBeenCalled()
    })

    it('includes assigneeName in JSON output', async () => {
        const program = createProgram()

        mockApi.getCompletedTasksByCompletionDate.mockResolvedValue({
            items: [
                {
                    id: 'task-1',
                    content: 'Assigned task',
                    projectId: 'proj-shared',
                    priority: 1,
                    responsibleUid: 'user-123',
                },
            ],
            nextCursor: null,
        })
        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-shared', name: 'Shared Project', isShared: true }],
            nextCursor: null,
        })
        mockApi.getProjectCollaborators.mockResolvedValue({
            results: [{ id: 'user-123', name: 'Alice Smith', email: 'alice@example.com' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'completed', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.results[0].assigneeName).toBe('Alice S.')
    })
})
