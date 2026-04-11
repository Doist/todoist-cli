import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api/core.js', () => ({
    getApi: vi.fn(),
}))

import { registerCompletedCommand } from '../commands/completed/index.js'
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

    it('outputs NDJSON meta cursor when no tasks are returned', async () => {
        const program = createProgram()

        await program.parseAsync([
            'node',
            'td',
            'completed',
            '--ndjson',
            '--limit',
            '0',
            '--cursor',
            'cursor-123',
        ])

        const output = consoleSpy.mock.calls[0][0]
        const lines = output.split('\n')
        expect(lines).toHaveLength(1)
        const meta = JSON.parse(lines[0])
        expect(meta._meta).toBe(true)
        expect(meta.nextCursor).toBe('cursor-123')
        expect(mockApi.getCompletedTasksByCompletionDate).not.toHaveBeenCalled()
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

    it('includes responsibleName in JSON output', async () => {
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
        expect(parsed.results[0].responsibleName).toBe('Alice S.')
    })

    describe('--search', () => {
        it('searches completed tasks by query', async () => {
            const program = createProgram()

            mockApi.searchCompletedTasks.mockResolvedValue({
                items: [
                    {
                        id: 'task-1',
                        content: 'Meeting notes review',
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

            await program.parseAsync(['node', 'td', 'completed', 'list', '--search', 'meeting'])

            expect(mockApi.searchCompletedTasks).toHaveBeenCalledWith(
                expect.objectContaining({ query: 'meeting' }),
            )
            expect(mockApi.getCompletedTasksByCompletionDate).not.toHaveBeenCalled()
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('search: "meeting"'))
        })

        it('does not call searchCompletedTasks when --search is not provided', async () => {
            const program = createProgram()

            await program.parseAsync(['node', 'td', 'completed', 'list'])

            expect(mockApi.getCompletedTasksByCompletionDate).toHaveBeenCalled()
            expect(mockApi.searchCompletedTasks).not.toHaveBeenCalled()
        })

        it('shows empty message when search returns no results', async () => {
            const program = createProgram()

            mockApi.searchCompletedTasks.mockResolvedValue({
                items: [],
                nextCursor: null,
            })

            await program.parseAsync(['node', 'td', 'completed', 'list', '--search', 'nonexistent'])

            expect(consoleSpy).toHaveBeenCalledWith('No matching completed tasks.')
        })

        it('outputs JSON with --search and --json', async () => {
            const program = createProgram()

            mockApi.searchCompletedTasks.mockResolvedValue({
                items: [{ id: 'task-1', content: 'Found task', projectId: 'proj-1' }],
                nextCursor: null,
            })
            mockApi.getProjects.mockResolvedValue({
                results: [{ id: 'proj-1', name: 'Work' }],
                nextCursor: null,
            })

            await program.parseAsync([
                'node',
                'td',
                'completed',
                'list',
                '--search',
                'found',
                '--json',
            ])

            const output = consoleSpy.mock.calls[0][0]
            const parsed = JSON.parse(output)
            expect(parsed.results).toBeDefined()
            expect(parsed.results[0].content).toBe('Found task')
        })

        it('errors when --search is used with --since', async () => {
            const program = createProgram()

            await expect(
                program.parseAsync([
                    'node',
                    'td',
                    'completed',
                    'list',
                    '--search',
                    'test',
                    '--since',
                    '2024-01-01',
                ]),
            ).rejects.toThrow('Cannot use --since, --until, or --project with --search')
        })

        it('errors when --search is used with --until', async () => {
            const program = createProgram()

            await expect(
                program.parseAsync([
                    'node',
                    'td',
                    'completed',
                    'list',
                    '--search',
                    'test',
                    '--until',
                    '2024-12-31',
                ]),
            ).rejects.toThrow('Cannot use --since, --until, or --project with --search')
        })

        it('errors when --search is used with --project', async () => {
            const program = createProgram()

            await expect(
                program.parseAsync([
                    'node',
                    'td',
                    'completed',
                    'list',
                    '--search',
                    'test',
                    '--project',
                    'Work',
                ]),
            ).rejects.toThrow('Cannot use --since, --until, or --project with --search')
        })
    })
})
