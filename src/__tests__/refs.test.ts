import { describe, expect, it, vi } from 'vitest'
import {
    extractId,
    isIdRef,
    looksLikeRawId,
    requireIdRef,
    resolveParentTaskId,
    resolveProjectId,
    resolveProjectRef,
    resolveSectionId,
    resolveTaskRef,
} from '../lib/refs.js'
import { fixtures } from './helpers/fixtures.js'
import { createMockApi } from './helpers/mock-api.js'

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

describe('requireIdRef', () => {
    it('returns ID when valid id: prefix', () => {
        expect(requireIdRef('id:123', 'task')).toBe('123')
        expect(requireIdRef('id:sec-1', 'section')).toBe('sec-1')
    })

    it('throws with formatted error for invalid ref', () => {
        expect(() => requireIdRef('some-name', 'comment')).toThrow('INVALID_REF')
        expect(() => requireIdRef('some-name', 'comment')).toThrow('Invalid comment reference')
    })

    it('includes hint in error message', () => {
        expect(() => requireIdRef('abc', 'section')).toThrow('id:abc')
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

    it('hints about id: prefix when ref looks like a raw ID', async () => {
        const api = createMockApi({
            getTasksByFilter: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        })

        await expect(resolveTaskRef(api, '6fmg66Fr27R59RPg')).rejects.toThrow('id:6fmg66Fr27R59RPg')
    })

    it('does not hint about id: prefix for plain name searches', async () => {
        const api = createMockApi({
            getTasksByFilter: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        })

        const error = await resolveTaskRef(api, 'nonexistent').catch((e: unknown) => e)
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).not.toContain('id:nonexistent')
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
            'does not belong to this project',
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
})
