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

        mockApi.getAllCompletedTasks.mockResolvedValue({
            items: [
                {
                    id: 'task-1',
                    content: 'Completed task',
                    projectId: 'proj-1',
                    priority: 1,
                },
            ],
            projects: { 'proj-1': { name: 'Work' } },
            sections: {},
        })

        await program.parseAsync(['node', 'td', 'completed'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Completed'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Completed task'))
    })

    it('uses today as default since date', async () => {
        const program = createProgram()

        await program.parseAsync(['node', 'td', 'completed'])

        expect(mockApi.getAllCompletedTasks).toHaveBeenCalledWith(
            expect.objectContaining({
                since: new Date(getToday() + 'T00:00:00'),
                until: new Date(getTomorrow() + 'T00:00:00'),
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

        expect(mockApi.getAllCompletedTasks).toHaveBeenCalledWith(
            expect.objectContaining({
                since: new Date('2024-01-01T00:00:00'),
                until: new Date('2024-01-08T00:00:00'),
            }),
        )
    })

    it('shows "No completed tasks" when empty', async () => {
        const program = createProgram()

        mockApi.getAllCompletedTasks.mockResolvedValue({
            items: [],
            projects: {},
            sections: {},
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
        mockApi.getAllCompletedTasks.mockResolvedValue({
            items: [],
            projects: {},
            sections: {},
        })

        await program.parseAsync(['node', 'td', 'completed', '--project', 'Work'])

        expect(mockApi.getAllCompletedTasks).toHaveBeenCalledWith(
            expect.objectContaining({
                projectId: 'proj-1',
            }),
        )
    })

    it('filters by label', async () => {
        const program = createProgram()

        mockApi.getAllCompletedTasks.mockResolvedValue({
            items: [],
            projects: {},
            sections: {},
        })

        await program.parseAsync(['node', 'td', 'completed', '--label', 'urgent'])

        expect(mockApi.getAllCompletedTasks).toHaveBeenCalledWith(
            expect.objectContaining({
                label: 'urgent',
            }),
        )
    })

    it('passes annotateNotes flag', async () => {
        const program = createProgram()

        await program.parseAsync(['node', 'td', 'completed', '--annotate-notes'])

        expect(mockApi.getAllCompletedTasks).toHaveBeenCalledWith(
            expect.objectContaining({
                annotateNotes: true,
            }),
        )
    })

    it('passes annotateItems flag', async () => {
        const program = createProgram()

        await program.parseAsync(['node', 'td', 'completed', '--annotate-items'])

        expect(mockApi.getAllCompletedTasks).toHaveBeenCalledWith(
            expect.objectContaining({
                annotateItems: true,
            }),
        )
    })

    it('respects --offset option', async () => {
        const program = createProgram()

        await program.parseAsync(['node', 'td', 'completed', '--offset', '10'])

        expect(mockApi.getAllCompletedTasks).toHaveBeenCalledWith(
            expect.objectContaining({
                offset: 10,
            }),
        )
    })

    it('outputs JSON with --json flag', async () => {
        const program = createProgram()

        mockApi.getAllCompletedTasks.mockResolvedValue({
            items: [{ id: 'task-1', content: 'Done task', projectId: 'proj-1' }],
            projects: { 'proj-1': { name: 'Work' } },
            sections: {},
        })

        await program.parseAsync(['node', 'td', 'completed', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.results).toBeDefined()
        expect(parsed.results[0].content).toBe('Done task')
    })

    it('outputs NDJSON with --ndjson flag', async () => {
        const program = createProgram()

        mockApi.getAllCompletedTasks.mockResolvedValue({
            items: [
                { id: 'task-1', content: 'Task 1', projectId: 'proj-1' },
                { id: 'task-2', content: 'Task 2', projectId: 'proj-1' },
            ],
            projects: { 'proj-1': { name: 'Work' } },
            sections: {},
        })

        await program.parseAsync(['node', 'td', 'completed', '--ndjson'])

        const output = consoleSpy.mock.calls[0][0]
        const lines = output.split('\n')
        expect(lines).toHaveLength(2)
    })

    it('uses inline project data for project names', async () => {
        const program = createProgram()

        mockApi.getAllCompletedTasks.mockResolvedValue({
            items: [{ id: 'task-1', content: 'Task', projectId: 'proj-1', priority: 1 }],
            projects: { 'proj-1': { name: 'Inline Project' } },
            sections: {},
        })

        await program.parseAsync(['node', 'td', 'completed'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Inline Project'))
        // Should NOT call getProjects when no assignees
        expect(mockApi.getProjects).not.toHaveBeenCalled()
    })

    it('respects --limit option', async () => {
        const program = createProgram()

        await program.parseAsync(['node', 'td', 'completed', '--limit', '10'])

        expect(mockApi.getAllCompletedTasks).toHaveBeenCalledWith(
            expect.objectContaining({
                limit: 10,
            }),
        )
    })

    it('displays assignee for shared project tasks', async () => {
        const program = createProgram()

        mockApi.getAllCompletedTasks.mockResolvedValue({
            items: [
                {
                    id: 'task-1',
                    content: 'Assigned task',
                    projectId: 'proj-shared',
                    priority: 1,
                    responsibleUid: 'user-123',
                },
            ],
            projects: { 'proj-shared': { name: 'Shared Project' } },
            sections: {},
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

        mockApi.getAllCompletedTasks.mockResolvedValue({
            items: [
                {
                    id: 'task-1',
                    content: 'Workspace task',
                    projectId: 'proj-ws',
                    priority: 1,
                    responsibleUid: 'user-456',
                },
            ],
            projects: { 'proj-ws': { name: 'Team Project' } },
            sections: {},
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

        mockApi.getAllCompletedTasks.mockResolvedValue({
            items: [
                {
                    id: 'task-1',
                    content: 'Unassigned task',
                    projectId: 'proj-1',
                    priority: 1,
                    responsibleUid: null,
                },
            ],
            projects: { 'proj-1': { name: 'Work' } },
            sections: {},
        })

        await program.parseAsync(['node', 'td', 'completed'])

        expect(mockApi.getProjectCollaborators).not.toHaveBeenCalled()
        expect(mockApi.getWorkspaceUsers).not.toHaveBeenCalled()
    })

    it('includes responsibleName in JSON output', async () => {
        const program = createProgram()

        mockApi.getAllCompletedTasks.mockResolvedValue({
            items: [
                {
                    id: 'task-1',
                    content: 'Assigned task',
                    projectId: 'proj-shared',
                    priority: 1,
                    responsibleUid: 'user-123',
                },
            ],
            projects: { 'proj-shared': { name: 'Shared Project' } },
            sections: {},
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
        expect(parsed.results[0].responsibleName).toBe('Alice S.')
    })

    it('shows offset hint when results equal limit', async () => {
        const program = createProgram()

        mockApi.getAllCompletedTasks.mockResolvedValue({
            items: Array.from({ length: 5 }, (_, i) => ({
                id: `task-${i}`,
                content: `Task ${i}`,
                projectId: 'proj-1',
                priority: 1,
            })),
            projects: { 'proj-1': { name: 'Work' } },
            sections: {},
        })

        await program.parseAsync(['node', 'td', 'completed', '--limit', '5'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('--offset 5'))
    })
})
