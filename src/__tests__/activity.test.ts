import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api/core.js', () => ({
    getApi: vi.fn(),
    getCurrentUserId: vi.fn(),
    isWorkspaceProject: vi.fn(),
}))

import { registerActivityCommand } from '../commands/activity.js'
import { getApi, getCurrentUserId, isWorkspaceProject } from '../lib/api/core.js'

const mockGetApi = vi.mocked(getApi)
const mockGetCurrentUserId = vi.mocked(getCurrentUserId)
const mockIsWorkspaceProject = vi.mocked(isWorkspaceProject)

function createMockApi() {
    return {
        getActivityLogs: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        getProjects: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
    }
}

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerActivityCommand(program)
    return program
}

describe('activity command', () => {
    let mockApi: ReturnType<typeof createMockApi>
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
        mockGetCurrentUserId.mockResolvedValue('user-123')
        mockIsWorkspaceProject.mockReturnValue(false)
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
        consoleSpy.mockRestore()
    })

    it('shows activity events', async () => {
        const program = createProgram()

        mockApi.getActivityLogs.mockResolvedValue({
            results: [
                {
                    id: 'event-1',
                    objectType: 'task',
                    objectId: 'task-1',
                    eventType: 'completed',
                    eventDate: '2025-01-10T14:30:00Z',
                    parentProjectId: 'proj-1',
                    parentItemId: null,
                    initiatorId: 'user-1',
                    extraData: { content: 'Buy groceries' },
                },
            ],
            nextCursor: null,
        })
        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Shopping' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'activity'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Activity'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('completed'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Buy groceries'))
    })

    it('shows "No activity found" when empty', async () => {
        const program = createProgram()

        mockApi.getActivityLogs.mockResolvedValue({
            results: [],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'activity'])

        expect(consoleSpy).toHaveBeenCalledWith('No activity found.')
    })

    it('filters by object type', async () => {
        const program = createProgram()

        await program.parseAsync(['node', 'td', 'activity', '--type', 'task'])

        expect(mockApi.getActivityLogs).toHaveBeenCalledWith(
            expect.objectContaining({
                objectType: 'task',
            }),
        )
    })

    it('filters by event type', async () => {
        const program = createProgram()

        await program.parseAsync(['node', 'td', 'activity', '--event', 'completed'])

        expect(mockApi.getActivityLogs).toHaveBeenCalledWith(
            expect.objectContaining({
                eventType: 'completed',
            }),
        )
    })

    it('filters by date range', async () => {
        const program = createProgram()

        await program.parseAsync([
            'node',
            'td',
            'activity',
            '--since',
            '2025-01-01',
            '--until',
            '2025-01-10',
        ])

        expect(mockApi.getActivityLogs).toHaveBeenCalledWith(
            expect.objectContaining({
                since: new Date('2025-01-01'),
                until: new Date('2025-01-10'),
            }),
        )
    })

    it('filters by project', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'activity', '--project', 'Work'])

        expect(mockApi.getActivityLogs).toHaveBeenCalledWith(
            expect.objectContaining({
                parentProjectId: 'proj-1',
            }),
        )
    })

    it('filters by initiator with "me"', async () => {
        const program = createProgram()

        await program.parseAsync(['node', 'td', 'activity', '--by', 'me'])

        expect(mockGetCurrentUserId).toHaveBeenCalled()
        expect(mockApi.getActivityLogs).toHaveBeenCalledWith(
            expect.objectContaining({
                initiatorId: 'user-123',
            }),
        )
    })

    it('filters by initiator with id: prefix', async () => {
        const program = createProgram()

        await program.parseAsync(['node', 'td', 'activity', '--by', 'id:user-456'])

        expect(mockApi.getActivityLogs).toHaveBeenCalledWith(
            expect.objectContaining({
                initiatorId: 'user-456',
            }),
        )
    })

    it('outputs JSON with --json flag', async () => {
        const program = createProgram()

        mockApi.getActivityLogs.mockResolvedValue({
            results: [
                {
                    id: 'event-1',
                    objectType: 'task',
                    objectId: 'task-1',
                    eventType: 'added',
                    eventDate: '2025-01-10T14:30:00Z',
                    parentProjectId: null,
                    parentItemId: null,
                    initiatorId: null,
                    extraData: null,
                },
            ],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'activity', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.results).toBeDefined()
        expect(parsed.results[0].eventType).toBe('added')
    })

    it('outputs NDJSON with --ndjson flag', async () => {
        const program = createProgram()

        mockApi.getActivityLogs.mockResolvedValue({
            results: [
                {
                    id: 'event-1',
                    objectType: 'task',
                    objectId: 'task-1',
                    eventType: 'added',
                    eventDate: '2025-01-10T14:30:00Z',
                    parentProjectId: null,
                    parentItemId: null,
                    initiatorId: null,
                    extraData: null,
                },
                {
                    id: 'event-2',
                    objectType: 'task',
                    objectId: 'task-2',
                    eventType: 'completed',
                    eventDate: '2025-01-10T14:35:00Z',
                    parentProjectId: null,
                    parentItemId: null,
                    initiatorId: null,
                    extraData: null,
                },
            ],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'activity', '--ndjson'])

        const output = consoleSpy.mock.calls[0][0]
        const lines = output.split('\n')
        expect(lines).toHaveLength(2)
    })

    it('outputs markdown with --markdown flag', async () => {
        const program = createProgram()

        mockApi.getActivityLogs.mockResolvedValue({
            results: [
                {
                    id: 'event-1',
                    objectType: 'task',
                    objectId: 'task-1',
                    eventType: 'completed',
                    eventDate: '2025-01-10T14:30:00Z',
                    parentProjectId: 'proj-1',
                    parentItemId: null,
                    initiatorId: null,
                    extraData: { content: 'Buy groceries' },
                },
            ],
            nextCursor: null,
        })
        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Shopping' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'activity', '--markdown'])

        const output = consoleSpy.mock.calls[0][0]
        expect(output).toContain('# Activity Log')
        expect(output).toContain('## 2025-01-10')
        expect(output).toMatch(
            /^- \d{2}:\d{2} - completed task: Buy groceries \(project: Shopping\)$/m,
        )
    })

    it('outputs markdown header when no activity and --markdown is used', async () => {
        const program = createProgram()

        mockApi.getActivityLogs.mockResolvedValue({
            results: [],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'activity', '--markdown'])

        expect(consoleSpy).toHaveBeenCalledWith('# Activity Log')
    })

    it('rejects conflicting output format flags', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'td', 'activity', '--markdown', '--json']),
        ).rejects.toThrow('mutually exclusive')
    })

    it('respects --limit option', async () => {
        const program = createProgram()

        await program.parseAsync(['node', 'td', 'activity', '--limit', '25'])

        expect(mockApi.getActivityLogs).toHaveBeenCalledWith(
            expect.objectContaining({
                limit: 25,
            }),
        )
    })

    it('includes project names in text output', async () => {
        const program = createProgram()

        mockApi.getActivityLogs.mockResolvedValue({
            results: [
                {
                    id: 'event-1',
                    objectType: 'task',
                    objectId: 'task-1',
                    eventType: 'added',
                    eventDate: '2025-01-10T14:30:00Z',
                    parentProjectId: 'proj-1',
                    parentItemId: null,
                    initiatorId: null,
                    extraData: { content: 'Test task' },
                },
            ],
            nextCursor: null,
        })
        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'activity'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Work'))
    })
})
