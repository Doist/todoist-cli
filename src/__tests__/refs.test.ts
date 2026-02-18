import { describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api/workspaces.js', () => ({
    fetchWorkspaces: vi.fn(),
    fetchWorkspaceFolders: vi.fn(),
}))

import { fetchWorkspaceFolders, fetchWorkspaces, type Workspace } from '../lib/api/workspaces.js'
import {
    classifyTodoistUrl,
    extractId,
    isIdRef,
    lenientIdRef,
    looksLikeRawId,
    parseTodoistUrl,
    resolveFolderRef,
    resolveParentTaskId,
    resolveProjectId,
    resolveProjectRef,
    resolveSectionId,
    resolveTaskRef,
    resolveWorkspaceRef,
} from '../lib/refs.js'
import { fixtures } from './helpers/fixtures.js'
import { createMockApi } from './helpers/mock-api.js'

const mockFetchWorkspaces = vi.mocked(fetchWorkspaces)
const mockFetchWorkspaceFolders = vi.mocked(fetchWorkspaceFolders)

describe('isIdRef', () => {
    it('returns true for "id:xxx" format', () => {
        expect(isIdRef('id:123')).toBe(true)
        expect(isIdRef('id:task-1')).toBe(true)
        expect(isIdRef('id:')).toBe(true)
    })

    it('returns false for plain text', () => {
        expect(isIdRef('Buy milk')).toBe(false)
        expect(isIdRef('task-1')).toBe(false)
        expect(isIdRef('123')).toBe(false)
    })

    it('returns false for empty string', () => {
        expect(isIdRef('')).toBe(false)
    })

    it('is case sensitive for prefix', () => {
        expect(isIdRef('ID:123')).toBe(false)
        expect(isIdRef('Id:123')).toBe(false)
    })
})

describe('extractId', () => {
    it('removes id: prefix', () => {
        expect(extractId('id:123')).toBe('123')
        expect(extractId('id:task-abc')).toBe('task-abc')
    })

    it('handles empty id after prefix', () => {
        expect(extractId('id:')).toBe('')
    })
})

describe('parseTodoistUrl', () => {
    it('extracts ID from slugged URL', () => {
        const result = parseTodoistUrl('https://app.todoist.com/app/task/buy-milk-abc123')
        expect(result).toEqual({ entityType: 'task', id: 'abc123' })
    })

    it('extracts ID from bare ID URL (no slug)', () => {
        const result = parseTodoistUrl('https://app.todoist.com/app/task/abc123')
        expect(result).toEqual({ entityType: 'task', id: 'abc123' })
    })

    it('extracts ID from project URL', () => {
        const result = parseTodoistUrl('https://app.todoist.com/app/project/my-project-proj1')
        expect(result).toEqual({ entityType: 'project', id: 'proj1' })
    })

    it('handles URLs with query parameters', () => {
        const result = parseTodoistUrl('https://app.todoist.com/app/task/buy-milk-abc123?lang=en')
        expect(result).toEqual({ entityType: 'task', id: 'abc123' })
    })

    it('handles URLs with hash fragments', () => {
        const result = parseTodoistUrl('https://app.todoist.com/app/task/buy-milk-abc123#details')
        expect(result).toEqual({ entityType: 'task', id: 'abc123' })
    })

    it('extracts ID from label URL', () => {
        const result = parseTodoistUrl('https://app.todoist.com/app/label/urgent-label1')
        expect(result).toEqual({ entityType: 'label', id: 'label1' })
    })

    it('extracts ID from filter URL', () => {
        const result = parseTodoistUrl('https://app.todoist.com/app/filter/work-tasks-filter1')
        expect(result).toEqual({ entityType: 'filter', id: 'filter1' })
    })

    it('extracts ID from bare label URL (no slug)', () => {
        const result = parseTodoistUrl('https://app.todoist.com/app/label/label1')
        expect(result).toEqual({ entityType: 'label', id: 'label1' })
    })

    it('extracts ID from bare filter URL (no slug)', () => {
        const result = parseTodoistUrl('https://app.todoist.com/app/filter/filter1')
        expect(result).toEqual({ entityType: 'filter', id: 'filter1' })
    })

    it('returns null for non-Todoist URLs', () => {
        expect(parseTodoistUrl('https://google.com')).toBeNull()
    })

    it('returns null for invalid strings', () => {
        expect(parseTodoistUrl('not a url')).toBeNull()
    })
})

describe('lenientIdRef', () => {
    it('returns ID when valid id: prefix', () => {
        expect(lenientIdRef('id:123', 'task')).toBe('123')
        expect(lenientIdRef('id:sec-1', 'section')).toBe('sec-1')
    })

    it('accepts raw alphanumeric IDs', () => {
        expect(lenientIdRef('6fmg66Fr27R59RPg', 'task')).toBe('6fmg66Fr27R59RPg')
        expect(lenientIdRef('abc123', 'section')).toBe('abc123')
    })

    it('accepts raw numeric IDs', () => {
        expect(lenientIdRef('12345678', 'task')).toBe('12345678')
    })

    it('throws for plain text names', () => {
        expect(() => lenientIdRef('some-name', 'comment')).toThrow('INVALID_REF')
        expect(() => lenientIdRef('Shopping', 'project')).toThrow('INVALID_REF')
    })

    it('throws for strings with spaces', () => {
        expect(() => lenientIdRef('Buy milk', 'task')).toThrow('INVALID_REF')
    })

    it('extracts ID from Todoist URL', () => {
        expect(lenientIdRef('https://app.todoist.com/app/task/buy-milk-abc123', 'task')).toBe(
            'abc123',
        )
    })

    it('includes URL hint in error message for task', () => {
        expect(() => lenientIdRef('some-name', 'task')).toThrow('Todoist URL')
    })

    it('includes URL hint in error message for project', () => {
        expect(() => lenientIdRef('some-name', 'project')).toThrow('Todoist URL')
    })

    it('extracts ID from label URL', () => {
        expect(lenientIdRef('https://app.todoist.com/app/label/urgent-label1', 'label')).toBe(
            'label1',
        )
    })

    it('extracts ID from filter URL', () => {
        expect(
            lenientIdRef('https://app.todoist.com/app/filter/work-tasks-filter1', 'filter'),
        ).toBe('filter1')
    })

    it('includes URL hint in error message for label', () => {
        expect(() => lenientIdRef('some-name', 'label')).toThrow('Todoist URL')
    })

    it('includes URL hint in error message for filter', () => {
        expect(() => lenientIdRef('some-name', 'filter')).toThrow('Todoist URL')
    })

    it('omits URL hint in error message for non-URL entity types', () => {
        expect(() => lenientIdRef('some-name', 'comment')).not.toThrow('Todoist URL')
    })

    it('throws on entity type mismatch (project URL for task)', () => {
        expect(() =>
            lenientIdRef('https://app.todoist.com/app/project/my-project-proj1', 'task'),
        ).toThrow('Expected a task URL, but got a project URL')
    })

    it('throws on entity type mismatch (task URL for project)', () => {
        expect(() =>
            lenientIdRef('https://app.todoist.com/app/task/buy-milk-abc123', 'project'),
        ).toThrow('Expected a project URL, but got a task URL')
    })

    it('throws on entity type mismatch (task URL for label)', () => {
        expect(() =>
            lenientIdRef('https://app.todoist.com/app/task/buy-milk-abc123', 'label'),
        ).toThrow('Expected a label URL, but got a task URL')
    })

    it('throws on entity type mismatch (label URL for filter)', () => {
        expect(() =>
            lenientIdRef('https://app.todoist.com/app/label/urgent-label1', 'filter'),
        ).toThrow('Expected a filter URL, but got a label URL')
    })
})

describe('looksLikeRawId', () => {
    it('detects alphanumeric mixed strings', () => {
        expect(looksLikeRawId('6fmg66Fr27R59RPg')).toBe(true)
        expect(looksLikeRawId('abc123')).toBe(true)
        expect(looksLikeRawId('task1')).toBe(true)
    })

    it('detects purely numeric strings', () => {
        expect(looksLikeRawId('123456789')).toBe(true)
        expect(looksLikeRawId('42')).toBe(true)
    })

    it('rejects strings with spaces', () => {
        expect(looksLikeRawId('Buy milk')).toBe(false)
        expect(looksLikeRawId('task 1')).toBe(false)
    })

    it('rejects pure alpha strings (likely names)', () => {
        expect(looksLikeRawId('Work')).toBe(false)
        expect(looksLikeRawId('Shopping')).toBe(false)
        expect(looksLikeRawId('mom')).toBe(false)
    })
})

describe('resolveTaskRef', () => {
    const tasks = [
        { id: 'task-1', content: 'Buy milk' },
        { id: 'task-2', content: 'Buy eggs' },
        { id: 'task-3', content: 'Call mom' },
    ]

    it('fetches by ID when using id: prefix', async () => {
        const api = createMockApi({
            getTask: vi.fn().mockResolvedValue(fixtures.tasks.basic),
        })

        const result = await resolveTaskRef(api, 'id:task-1')
        expect(result.id).toBe('task-1')
        expect(api.getTask).toHaveBeenCalledWith('task-1')
    })

    it('fetches by ID extracted from Todoist URL', async () => {
        const task = { id: 'abc123', content: 'Buy milk' }
        const api = createMockApi({
            getTask: vi.fn().mockResolvedValue(task),
        })

        const result = await resolveTaskRef(api, 'https://app.todoist.com/app/task/buy-milk-abc123')
        expect(result.id).toBe('abc123')
        expect(api.getTask).toHaveBeenCalledWith('abc123')
    })

    it('resolves exact name match (case insensitive)', async () => {
        const api = createMockApi({
            getTasksByFilter: vi.fn().mockResolvedValue({ results: [tasks[2]], nextCursor: null }),
        })

        const result = await resolveTaskRef(api, 'call mom')
        expect(result.id).toBe('task-3')
        expect(api.getTasksByFilter).toHaveBeenCalledWith(
            expect.objectContaining({ query: 'search: call mom' }),
        )
    })

    it('resolves unique partial match', async () => {
        const api = createMockApi({
            getTasksByFilter: vi.fn().mockResolvedValue({ results: [tasks[2]], nextCursor: null }),
        })

        const result = await resolveTaskRef(api, 'mom')
        expect(result.id).toBe('task-3')
        expect(api.getTasksByFilter).toHaveBeenCalledWith(
            expect.objectContaining({ query: 'search: mom' }),
        )
    })

    it('throws on ambiguous match', async () => {
        const api = createMockApi({
            getTasksByFilter: vi
                .fn()
                .mockResolvedValue({ results: [tasks[0], tasks[1]], nextCursor: null }),
        })

        await expect(resolveTaskRef(api, 'Buy')).rejects.toThrow('Multiple tasks match')
    })

    it('throws when not found', async () => {
        const api = createMockApi({
            getTasksByFilter: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        })

        await expect(resolveTaskRef(api, 'nonexistent')).rejects.toThrow('not found')
    })

    it('auto-retries id-like refs as direct ID lookup', async () => {
        const api = createMockApi({
            getTask: vi.fn().mockResolvedValue(tasks[0]),
            getTasksByFilter: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        })

        // Alphanumeric mix (e.g. Todoist task ID pasted without id: prefix)
        const result = await resolveTaskRef(api, '6fmg66Fr27R59RPg')
        expect(result.id).toBe('task-1')
        expect(api.getTasksByFilter).toHaveBeenCalledWith(
            expect.objectContaining({ query: 'search: 6fmg66Fr27R59RPg' }),
        )
        expect(api.getTask).toHaveBeenCalledWith('6fmg66Fr27R59RPg')
    })

    it('auto-retries numeric refs as direct ID lookup', async () => {
        const api = createMockApi({
            getTask: vi.fn().mockResolvedValue(tasks[0]),
            getTasksByFilter: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        })

        // Pure numeric (legacy Todoist task ID)
        const result = await resolveTaskRef(api, '12345678')
        expect(result.id).toBe('task-1')
        expect(api.getTask).toHaveBeenCalledWith('12345678')
    })

    it('does not auto-retry plain text refs', async () => {
        const api = createMockApi({
            getTasksByFilter: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        })

        await expect(resolveTaskRef(api, 'nonexistent')).rejects.toThrow('not found')
        expect(api.getTask).not.toHaveBeenCalled()
    })

    it('rethrows non-404 API errors from raw ID fallback', async () => {
        const { TodoistRequestError } = await import('@doist/todoist-api-typescript')
        const networkError = new TodoistRequestError('Service Unavailable', 503)
        const api = createMockApi({
            getTask: vi.fn().mockRejectedValue(networkError),
            getTasksByFilter: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        })

        await expect(resolveTaskRef(api, '6fmg66Fr27R59RPg')).rejects.toThrow('Service Unavailable')
    })
})

describe('resolveProjectRef', () => {
    const projects = [
        { id: 'proj-1', name: 'Work' },
        { id: 'proj-2', name: 'Personal' },
        { id: 'proj-3', name: 'Work Tasks' },
    ]

    it('fetches by ID when using id: prefix', async () => {
        const api = createMockApi({
            getProject: vi.fn().mockResolvedValue(fixtures.projects.work),
        })

        const result = await resolveProjectRef(api, 'id:proj-work')
        expect(result.id).toBe('proj-work')
        expect(api.getProject).toHaveBeenCalledWith('proj-work')
    })

    it('fetches by ID extracted from Todoist URL', async () => {
        const project = { id: 'proj123', name: 'Work' }
        const api = createMockApi({
            getProject: vi.fn().mockResolvedValue(project),
        })

        const result = await resolveProjectRef(
            api,
            'https://app.todoist.com/app/project/work-proj123',
        )
        expect(result.id).toBe('proj123')
        expect(api.getProject).toHaveBeenCalledWith('proj123')
    })

    it('resolves exact name match', async () => {
        const api = createMockApi({
            getProjects: vi.fn().mockResolvedValue({ results: projects }),
        })

        const result = await resolveProjectRef(api, 'Personal')
        expect(result.id).toBe('proj-2')
    })

    it('resolves partial match when unique', async () => {
        const api = createMockApi({
            getProjects: vi.fn().mockResolvedValue({ results: projects }),
        })

        const result = await resolveProjectRef(api, 'Person')
        expect(result.id).toBe('proj-2')
    })

    it('prefers exact match over partial', async () => {
        const api = createMockApi({
            getProjects: vi.fn().mockResolvedValue({ results: projects }),
        })

        const result = await resolveProjectRef(api, 'Work')
        expect(result.id).toBe('proj-1')
    })

    it('throws on ambiguous match', async () => {
        const projectsWithAmbiguity = [
            { id: 'proj-1', name: 'Shopping List' },
            { id: 'proj-2', name: 'Shopping Ideas' },
        ]
        const api = createMockApi({
            getProjects: vi.fn().mockResolvedValue({ results: projectsWithAmbiguity }),
        })

        await expect(resolveProjectRef(api, 'Shopping')).rejects.toThrow('Multiple projects match')
    })

    it('throws when not found', async () => {
        const api = createMockApi({
            getProjects: vi.fn().mockResolvedValue({ results: projects }),
        })

        await expect(resolveProjectRef(api, 'nonexistent')).rejects.toThrow('not found')
    })

    it('auto-retries id-like refs as direct ID lookup', async () => {
        const api = createMockApi({
            getProject: vi.fn().mockResolvedValue(projects[0]),
            getProjects: vi.fn().mockResolvedValue({ results: [] }),
        })

        const result = await resolveProjectRef(api, '6fmg66Fr27R59RPg')
        expect(result.id).toBe('proj-1')
        expect(api.getProject).toHaveBeenCalledWith('6fmg66Fr27R59RPg')
    })

    it('auto-retries numeric refs as direct ID lookup', async () => {
        const api = createMockApi({
            getProject: vi.fn().mockResolvedValue(projects[0]),
            getProjects: vi.fn().mockResolvedValue({ results: [] }),
        })

        const result = await resolveProjectRef(api, '12345678')
        expect(result.id).toBe('proj-1')
        expect(api.getProject).toHaveBeenCalledWith('12345678')
    })

    it('does not auto-retry plain text refs', async () => {
        const api = createMockApi({
            getProjects: vi.fn().mockResolvedValue({ results: projects }),
        })

        await expect(resolveProjectRef(api, 'nonexistent')).rejects.toThrow('not found')
        expect(api.getProject).not.toHaveBeenCalled()
    })
})

describe('resolveProjectId', () => {
    it('returns just the ID from resolved project', async () => {
        const api = createMockApi({
            getProject: vi.fn().mockResolvedValue(fixtures.projects.work),
        })

        const result = await resolveProjectId(api, 'id:proj-work')
        expect(result).toBe('proj-work')
    })

    it('resolves by name and returns ID', async () => {
        const projects = [{ id: 'proj-1', name: 'Work' }]
        const api = createMockApi({
            getProjects: vi.fn().mockResolvedValue({ results: projects }),
        })

        const result = await resolveProjectId(api, 'Work')
        expect(result).toBe('proj-1')
    })
})

describe('resolveSectionId', () => {
    const sections = [
        { id: 'sec-1', name: 'Planning' },
        { id: 'sec-2', name: 'In Progress' },
        { id: 'sec-3', name: 'Review' },
        { id: 'sec-4', name: 'Plan B' },
    ]

    it('resolves exact ID when using id: prefix', async () => {
        const api = createMockApi({
            getSections: vi.fn().mockResolvedValue({ results: sections }),
        })

        const result = await resolveSectionId(api, 'id:sec-2', 'proj-1')
        expect(result).toBe('sec-2')
    })

    it('throws when ID not found in project sections', async () => {
        const api = createMockApi({
            getSections: vi.fn().mockResolvedValue({ results: sections }),
        })

        await expect(resolveSectionId(api, 'id:nonexistent', 'proj-1')).rejects.toThrow(
            'not found in project',
        )
    })

    it('resolves exact name match (case insensitive)', async () => {
        const api = createMockApi({
            getSections: vi.fn().mockResolvedValue({ results: sections }),
        })

        const result = await resolveSectionId(api, 'planning', 'proj-1')
        expect(result).toBe('sec-1')
    })

    it('resolves partial name match when unique', async () => {
        const api = createMockApi({
            getSections: vi.fn().mockResolvedValue({ results: sections }),
        })

        const result = await resolveSectionId(api, 'Progress', 'proj-1')
        expect(result).toBe('sec-2')
    })

    it('throws on ambiguous partial match', async () => {
        const api = createMockApi({
            getSections: vi.fn().mockResolvedValue({ results: sections }),
        })

        await expect(resolveSectionId(api, 'Plan', 'proj-1')).rejects.toThrow(
            'Multiple sections match',
        )
    })

    it('throws when section not found', async () => {
        const api = createMockApi({
            getSections: vi.fn().mockResolvedValue({ results: sections }),
        })

        await expect(resolveSectionId(api, 'Nonexistent', 'proj-1')).rejects.toThrow(
            'not found in project',
        )
    })

    it('resolves raw ID-like string as section ID', async () => {
        const sectionsWithNumericId = [...sections, { id: '99887766', name: 'Done' }]
        const api = createMockApi({
            getSections: vi.fn().mockResolvedValue({ results: sectionsWithNumericId }),
        })

        const result = await resolveSectionId(api, '99887766', 'proj-1')
        expect(result).toBe('99887766')
    })
})

describe('resolveParentTaskId', () => {
    const sectionTasks = [
        { id: 'task-1', content: 'Setup database' },
        { id: 'task-2', content: 'Setup API' },
    ]

    const projectTasks = [
        ...sectionTasks,
        { id: 'task-3', content: 'Write documentation' },
        { id: 'task-4', content: 'Final review' },
    ]

    it('returns ID directly when using id: prefix', async () => {
        const api = createMockApi()

        const result = await resolveParentTaskId(api, 'id:any-id', 'proj-1')
        expect(result).toBe('any-id')
        expect(api.getTasks).not.toHaveBeenCalled()
    })

    it('returns ID extracted from Todoist URL', async () => {
        const api = createMockApi()

        const result = await resolveParentTaskId(
            api,
            'https://app.todoist.com/app/task/setup-database-task123',
            'proj-1',
        )
        expect(result).toBe('task123')
        expect(api.getTasks).not.toHaveBeenCalled()
    })

    it('searches in section first when sectionId provided', async () => {
        const api = createMockApi({
            getTasks: vi.fn().mockResolvedValue({ results: sectionTasks }),
        })

        const result = await resolveParentTaskId(api, 'database', 'proj-1', 'sec-1')
        expect(result).toBe('task-1')
        expect(api.getTasks).toHaveBeenCalledWith({ sectionId: 'sec-1' })
    })

    it('falls back to project when not found in section', async () => {
        const api = createMockApi({
            getTasks: vi
                .fn()
                .mockResolvedValueOnce({ results: sectionTasks })
                .mockResolvedValueOnce({ results: projectTasks }),
        })

        const result = await resolveParentTaskId(api, 'documentation', 'proj-1', 'sec-1')
        expect(result).toBe('task-3')
        expect(api.getTasks).toHaveBeenCalledTimes(2)
    })

    it('searches project directly when no sectionId', async () => {
        const api = createMockApi({
            getTasks: vi.fn().mockResolvedValue({ results: projectTasks }),
        })

        const result = await resolveParentTaskId(api, 'review', 'proj-1')
        expect(result).toBe('task-4')
        expect(api.getTasks).toHaveBeenCalledWith({ projectId: 'proj-1' })
    })

    it('throws on ambiguous match in section', async () => {
        const api = createMockApi({
            getTasks: vi.fn().mockResolvedValue({ results: sectionTasks }),
        })

        await expect(resolveParentTaskId(api, 'Setup', 'proj-1', 'sec-1')).rejects.toThrow(
            'Multiple tasks match',
        )
    })

    it('throws on ambiguous match in project', async () => {
        const tasksWithDuplicates = [
            { id: 'task-1', content: 'Review PR #1' },
            { id: 'task-2', content: 'Review PR #2' },
        ]
        const api = createMockApi({
            getTasks: vi.fn().mockResolvedValue({ results: tasksWithDuplicates }),
        })

        await expect(resolveParentTaskId(api, 'Review', 'proj-1')).rejects.toThrow(
            'Multiple tasks match',
        )
    })

    it('throws when task not found in project', async () => {
        const api = createMockApi({
            getTasks: vi.fn().mockResolvedValue({ results: projectTasks }),
        })

        await expect(resolveParentTaskId(api, 'Nonexistent', 'proj-1')).rejects.toThrow(
            'not found in project',
        )
    })

    it('accepts raw ID-like string without id: prefix', async () => {
        const api = createMockApi({
            getTasks: vi.fn().mockResolvedValue({ results: [] }),
        })

        const result = await resolveParentTaskId(api, '6fmg66Fr27R59RPg', 'proj-1')
        expect(result).toBe('6fmg66Fr27R59RPg')
    })

    it('throws on entity type mismatch (project URL for parent task)', async () => {
        const api = createMockApi()

        await expect(
            resolveParentTaskId(
                api,
                'https://app.todoist.com/app/project/my-project-proj1',
                'proj-1',
            ),
        ).rejects.toThrow('Expected a task URL, but got a project URL')
        expect(api.getTasks).not.toHaveBeenCalled()
    })
})

describe('resolveWorkspaceRef', () => {
    const workspaces = [
        { id: 'ws-1', name: 'Doist' },
        { id: 'ws-2', name: 'Playground' },
        { id: 'ws-3', name: 'Design Team' },
    ] as Workspace[]

    it('resolves by id: prefix', async () => {
        mockFetchWorkspaces.mockResolvedValue(workspaces)

        const result = await resolveWorkspaceRef('id:ws-2')
        expect(result).toEqual(workspaces[1])
    })

    it('throws when ID not found', async () => {
        mockFetchWorkspaces.mockResolvedValue(workspaces)

        await expect(resolveWorkspaceRef('id:nonexistent')).rejects.toThrow('not found')
    })

    it('resolves exact name match (case insensitive)', async () => {
        mockFetchWorkspaces.mockResolvedValue(workspaces)

        const result = await resolveWorkspaceRef('doist')
        expect(result).toEqual(workspaces[0])
    })

    it('resolves partial name match when unique', async () => {
        mockFetchWorkspaces.mockResolvedValue(workspaces)

        const result = await resolveWorkspaceRef('Play')
        expect(result).toEqual(workspaces[1])
    })

    it('throws on ambiguous match', async () => {
        mockFetchWorkspaces.mockResolvedValue(workspaces)

        // "D" matches "Doist" and "Design Team"
        await expect(resolveWorkspaceRef('D')).rejects.toThrow('Multiple workspaces match')
    })

    it('throws when not found', async () => {
        mockFetchWorkspaces.mockResolvedValue(workspaces)

        await expect(resolveWorkspaceRef('nonexistent')).rejects.toThrow('not found')
    })

    it('resolves raw ID-like string as workspace ID', async () => {
        const workspacesWithNumericId = [
            ...workspaces,
            { id: '99887766', name: 'Test' },
        ] as Workspace[]
        mockFetchWorkspaces.mockResolvedValue(workspacesWithNumericId)

        const result = await resolveWorkspaceRef('99887766')
        expect(result).toEqual({ id: '99887766', name: 'Test' })
    })
})

describe('resolveFolderRef', () => {
    const folders = [
        { id: 'folder-1', name: 'Engineering', workspaceId: 'ws-1' },
        { id: 'folder-2', name: 'Marketing', workspaceId: 'ws-1' },
        { id: 'folder-3', name: 'Design', workspaceId: 'ws-2' },
    ]

    it('resolves by id: prefix', async () => {
        mockFetchWorkspaceFolders.mockResolvedValue(folders)

        const result = await resolveFolderRef('id:folder-1', 'ws-1')
        expect(result).toEqual(folders[0])
    })

    it('throws when ID not found in workspace', async () => {
        mockFetchWorkspaceFolders.mockResolvedValue(folders)

        await expect(resolveFolderRef('id:nonexistent', 'ws-1')).rejects.toThrow(
            'not found in workspace',
        )
    })

    it('resolves exact name match (case insensitive)', async () => {
        mockFetchWorkspaceFolders.mockResolvedValue(folders)

        const result = await resolveFolderRef('engineering', 'ws-1')
        expect(result).toEqual(folders[0])
    })

    it('resolves partial name match when unique', async () => {
        mockFetchWorkspaceFolders.mockResolvedValue(folders)

        const result = await resolveFolderRef('Market', 'ws-1')
        expect(result).toEqual(folders[1])
    })

    it('throws on ambiguous match', async () => {
        const foldersWithAmbiguity = [
            { id: 'folder-1', name: 'Engineering Frontend', workspaceId: 'ws-1' },
            { id: 'folder-2', name: 'Engineering Backend', workspaceId: 'ws-1' },
        ]
        mockFetchWorkspaceFolders.mockResolvedValue(foldersWithAmbiguity)

        await expect(resolveFolderRef('Engineering', 'ws-1')).rejects.toThrow(
            'Multiple folders match',
        )
    })

    it('throws when not found', async () => {
        mockFetchWorkspaceFolders.mockResolvedValue(folders)

        await expect(resolveFolderRef('nonexistent', 'ws-1')).rejects.toThrow(
            'not found in workspace',
        )
    })

    it('only searches folders in the given workspace', async () => {
        mockFetchWorkspaceFolders.mockResolvedValue(folders)

        // "Design" folder exists in ws-2 but not ws-1
        await expect(resolveFolderRef('Design', 'ws-1')).rejects.toThrow('not found in workspace')
    })

    it('resolves raw ID-like string as folder ID', async () => {
        const foldersWithNumericId = [
            ...folders,
            { id: '99887766', name: 'Test', workspaceId: 'ws-1' },
        ]
        mockFetchWorkspaceFolders.mockResolvedValue(foldersWithNumericId)

        const result = await resolveFolderRef('99887766', 'ws-1')
        expect(result).toEqual({ id: '99887766', name: 'Test', workspaceId: 'ws-1' })
    })
})

describe('classifyTodoistUrl', () => {
    it('classifies task URLs as entity routes', () => {
        const result = classifyTodoistUrl(
            'https://app.todoist.com/app/task/buy-milk-8Jx4mVr72kPn3QwB',
        )
        expect(result).toEqual({
            kind: 'entity',
            entityType: 'task',
            id: '8Jx4mVr72kPn3QwB',
        })
    })

    it('classifies project URLs as entity routes', () => {
        const result = classifyTodoistUrl(
            'https://app.todoist.com/app/project/work-2pN7vKx49mRq6YhT',
        )
        expect(result).toEqual({
            kind: 'entity',
            entityType: 'project',
            id: '2pN7vKx49mRq6YhT',
        })
    })

    it('classifies label URLs as entity routes', () => {
        const result = classifyTodoistUrl('https://app.todoist.com/app/label/urgent-abc123')
        expect(result).toEqual({
            kind: 'entity',
            entityType: 'label',
            id: 'abc123',
        })
    })

    it('classifies filter URLs as entity routes', () => {
        const result = classifyTodoistUrl('https://app.todoist.com/app/filter/work-tasks-def456')
        expect(result).toEqual({
            kind: 'entity',
            entityType: 'filter',
            id: 'def456',
        })
    })

    it('classifies today URL as view route', () => {
        const result = classifyTodoistUrl('https://app.todoist.com/app/today')
        expect(result).toEqual({ kind: 'view', view: 'today' })
    })

    it('classifies upcoming URL as view route', () => {
        const result = classifyTodoistUrl('https://app.todoist.com/app/upcoming')
        expect(result).toEqual({ kind: 'view', view: 'upcoming' })
    })

    it('handles today URL with query params', () => {
        const result = classifyTodoistUrl('https://app.todoist.com/app/today?lang=en')
        expect(result).toEqual({ kind: 'view', view: 'today' })
    })

    it('handles upcoming URL with fragment', () => {
        const result = classifyTodoistUrl('https://app.todoist.com/app/upcoming#section')
        expect(result).toEqual({ kind: 'view', view: 'upcoming' })
    })

    it('returns null for non-Todoist URLs', () => {
        expect(classifyTodoistUrl('https://example.com')).toBeNull()
    })

    it('returns null for unrecognized Todoist paths', () => {
        expect(classifyTodoistUrl('https://app.todoist.com/app/settings')).toBeNull()
    })

    it('returns null for plain text', () => {
        expect(classifyTodoistUrl('Buy milk')).toBeNull()
    })
})
