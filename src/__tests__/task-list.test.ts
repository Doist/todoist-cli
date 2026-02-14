import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PRIORITY_CHOICES, parsePriority } from '../lib/task-list.js'

describe('parsePriority', () => {
    it('parses p1 to API priority 4', () => {
        expect(parsePriority('p1')).toBe(4)
    })

    it('parses p2 to API priority 3', () => {
        expect(parsePriority('p2')).toBe(3)
    })

    it('parses p3 to API priority 2', () => {
        expect(parsePriority('p3')).toBe(2)
    })

    it('parses p4 to API priority 1', () => {
        expect(parsePriority('p4')).toBe(1)
    })

    it('is case insensitive', () => {
        expect(parsePriority('P1')).toBe(4)
        expect(parsePriority('P2')).toBe(3)
        expect(parsePriority('P3')).toBe(2)
        expect(parsePriority('P4')).toBe(1)
    })

    it('throws for invalid format like "high"', () => {
        expect(() => parsePriority('high')).toThrow('INVALID_PRIORITY')
    })

    it('throws for p0', () => {
        expect(() => parsePriority('p0')).toThrow('INVALID_PRIORITY')
    })

    it('throws for p5', () => {
        expect(() => parsePriority('p5')).toThrow('INVALID_PRIORITY')
    })

    it('throws for numeric strings', () => {
        expect(() => parsePriority('1')).toThrow('INVALID_PRIORITY')
        expect(() => parsePriority('4')).toThrow('INVALID_PRIORITY')
    })

    it('throws for empty string', () => {
        expect(() => parsePriority('')).toThrow('INVALID_PRIORITY')
    })

    it.each(PRIORITY_CHOICES)('accepts choice "%s"', (value) => {
        expect(() => parsePriority(value)).not.toThrow()
    })
})

describe('listTasksForProject', () => {
    let mockApi: ReturnType<typeof createTestMockApi>
    let consoleSpy: ReturnType<typeof vi.spyOn>

    function createTestMockApi() {
        return {
            getTasks: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
            getTasksByFilter: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
            getProject: vi.fn(),
            getSections: vi.fn().mockResolvedValue({ results: [] }),
            getProjects: vi.fn().mockResolvedValue({ results: [] }),
        }
    }

    beforeEach(async () => {
        vi.resetModules()
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi = createTestMockApi()

        vi.doMock('../lib/api/core.js', () => ({
            getApi: vi.fn().mockResolvedValue(mockApi),
            isWorkspaceProject: vi.fn(
                (project: { workspaceId?: string }) => project.workspaceId !== undefined,
            ),
        }))
    })

    afterEach(() => {
        vi.clearAllMocks()
        consoleSpy.mockRestore()
    })

    it('fetches tasks for specified projectId', async () => {
        const { listTasksForProject } = await import('../lib/task-list.js')

        mockApi.getProject.mockResolvedValue({ id: 'proj-1', name: 'Work' })

        await listTasksForProject('proj-1', {})

        expect(mockApi.getTasks).toHaveBeenCalledWith(
            expect.objectContaining({ projectId: 'proj-1' }),
        )
    })

    it('fetches all tasks when projectId is null', async () => {
        const { listTasksForProject } = await import('../lib/task-list.js')

        await listTasksForProject(null, {})

        expect(mockApi.getTasks).toHaveBeenCalledWith(
            expect.not.objectContaining({ projectId: expect.anything() }),
        )
    })

    it('filters by priority option', async () => {
        const { listTasksForProject } = await import('../lib/task-list.js')

        const tasks = [
            {
                id: 'task-1',
                content: 'High priority',
                priority: 4,
                projectId: 'proj-1',
            },
        ]
        mockApi.getTasksByFilter.mockResolvedValue({ results: tasks, nextCursor: null })
        mockApi.getProject.mockResolvedValue({ id: 'proj-1', name: 'Work' })

        await listTasksForProject('proj-1', { priority: 'p1' })

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('High priority'))
        expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Low priority'))
        expect(mockApi.getTasksByFilter).toHaveBeenCalledWith(
            expect.objectContaining({
                query: 'p1',
            }),
        )
    })

    it('outputs JSON when --json flag', async () => {
        const { listTasksForProject } = await import('../lib/task-list.js')

        const tasks = [{ id: 'task-1', content: 'Test', priority: 1, projectId: 'proj-1' }]
        mockApi.getTasks.mockResolvedValue({ results: tasks, nextCursor: null })

        await listTasksForProject('proj-1', { json: true })

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.results).toBeDefined()
        expect(parsed.nextCursor).toBeNull()
    })

    it('outputs NDJSON when --ndjson flag', async () => {
        const { listTasksForProject } = await import('../lib/task-list.js')

        const tasks = [
            { id: 'task-1', content: 'Test 1', priority: 1, projectId: 'proj-1' },
            { id: 'task-2', content: 'Test 2', priority: 2, projectId: 'proj-1' },
        ]
        mockApi.getTasks.mockResolvedValue({ results: tasks, nextCursor: null })

        await listTasksForProject('proj-1', { ndjson: true })

        const output = consoleSpy.mock.calls[0][0]
        const lines = output.split('\n')
        expect(lines.length).toBe(2)
        expect(JSON.parse(lines[0]).id).toBe('task-1')
        expect(JSON.parse(lines[1]).id).toBe('task-2')
    })

    it('groups by section when projectId specified', async () => {
        const { listTasksForProject } = await import('../lib/task-list.js')

        const tasks = [
            {
                id: 'task-1',
                content: 'In Planning',
                sectionId: 'sec-1',
                projectId: 'proj-1',
            },
            {
                id: 'task-2',
                content: 'No section',
                sectionId: null,
                projectId: 'proj-1',
            },
        ]
        mockApi.getTasks.mockResolvedValue({ results: tasks, nextCursor: null })
        mockApi.getProject.mockResolvedValue({ id: 'proj-1', name: 'Work' })
        mockApi.getSections.mockResolvedValue({
            results: [{ id: 'sec-1', name: 'Planning' }],
        })

        await listTasksForProject('proj-1', {})

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Planning'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('no section'))
    })

    it('shows flat list when projectId is null', async () => {
        const { listTasksForProject } = await import('../lib/task-list.js')

        const tasks = [
            { id: 'task-1', content: 'Task 1', projectId: 'proj-1' },
            { id: 'task-2', content: 'Task 2', projectId: 'proj-2' },
        ]
        mockApi.getTasks.mockResolvedValue({ results: tasks, nextCursor: null })
        mockApi.getProjects.mockResolvedValue({
            results: [
                { id: 'proj-1', name: 'Work' },
                { id: 'proj-2', name: 'Personal' },
            ],
        })

        await listTasksForProject(null, {})

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Work'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Personal'))
    })

    it('respects limit option', async () => {
        const { listTasksForProject } = await import('../lib/task-list.js')

        mockApi.getProject.mockResolvedValue({ id: 'proj-1', name: 'Work' })

        await listTasksForProject('proj-1', { limit: '10' })

        expect(mockApi.getTasks).toHaveBeenCalledWith(expect.objectContaining({ limit: 10 }))
    })

    it('shows "No tasks found" for empty results', async () => {
        const { listTasksForProject } = await import('../lib/task-list.js')

        mockApi.getTasks.mockResolvedValue({ results: [], nextCursor: null })
        mockApi.getProject.mockResolvedValue({ id: 'proj-1', name: 'Work' })

        await listTasksForProject('proj-1', {})

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No tasks found'))
    })
})
