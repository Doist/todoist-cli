import type { PersonalProject } from '@doist/todoist-sdk'
import { beforeEach, describe, expect, it } from 'vitest'
import { fixtures } from '../test-support/fixtures.js'
import { createMockApi, type MockApi } from '../test-support/mock-api.js'
import { buildProjectChildren, CHILDREN_MAX, getTaskChildren, resolveChildren } from './children.js'

function personalProject(overrides: Partial<PersonalProject>): PersonalProject {
    return { ...fixtures.projects.child, ...overrides } as PersonalProject
}

describe('buildProjectChildren', () => {
    it('returns direct children only, flagging the ones that nest further', () => {
        const parent = fixtures.projects.parent
        const all = [
            personalProject({ id: 'child-b', name: 'B', parentId: parent.id, childOrder: 2 }),
            personalProject({ id: 'child-a', name: 'A', parentId: parent.id, childOrder: 1 }),
            personalProject({ id: 'grandchild', name: 'A1', parentId: 'child-a', childOrder: 1 }),
            personalProject({ id: 'unrelated', name: 'Elsewhere', parentId: null }),
        ]

        const result = buildProjectChildren(parent, all)

        expect(result.childCount).toBe(2)
        expect(result.children?.map((c) => [c.id, c.hasChildren])).toEqual([
            ['child-a', true],
            ['child-b', false],
        ])
        expect(result.hasMoreChildren).toBeUndefined()
    })

    it('reports zero for a project with no sub-projects', () => {
        const result = buildProjectChildren(fixtures.projects.parent, [
            personalProject({ id: 'unrelated', parentId: null }),
        ])

        expect(result).toEqual({ childCount: 0, children: [] })
    })

    it('short-circuits workspace projects, which nest under folders', () => {
        const all = [
            personalProject({ id: 'child', parentId: fixtures.projects.workspaceProject.id }),
        ]

        const result = buildProjectChildren(fixtures.projects.workspaceProject, all)

        expect(result).toEqual({ childCount: 0, children: [] })
    })

    it('truncates past the cap and flags that more exist', () => {
        const parent = fixtures.projects.parent
        const all = Array.from({ length: CHILDREN_MAX + 5 }, (_, index) =>
            personalProject({ id: `child-${index}`, parentId: parent.id, childOrder: index }),
        )

        const result = buildProjectChildren(parent, all)

        expect(result.childCount).toBe(CHILDREN_MAX)
        expect(result.children).toHaveLength(CHILDREN_MAX)
        expect(result.hasMoreChildren).toBe(true)
    })
})

describe('getTaskChildren', () => {
    let api: MockApi

    beforeEach(() => {
        api = createMockApi()
    })

    it('reports zero children for a leaf task without probing', async () => {
        api.getTasks.mockResolvedValue({ results: [], nextCursor: null })

        const result = await getTaskChildren(api, 'task-parent')

        expect(api.getTasks).toHaveBeenCalledTimes(1)
        expect(api.getTasks).toHaveBeenCalledWith({
            parentId: 'task-parent',
            limit: CHILDREN_MAX,
        })
        expect(result).toEqual({
            childCount: 0,
            children: [],
            hasMoreChildren: undefined,
            childrenError: undefined,
        })
    })

    it('probes each child once and flags the ones that nest further', async () => {
        const first = { ...fixtures.tasks.child, id: 'sub-1' }
        const second = { ...fixtures.tasks.child, id: 'sub-2' }
        api.getTasks.mockImplementation(async (args) => {
            if (args?.parentId === 'task-parent') {
                return { results: [first, second], nextCursor: null }
            }
            if (args?.parentId === 'sub-1') {
                return { results: [fixtures.tasks.basic], nextCursor: null }
            }
            return { results: [], nextCursor: null }
        })

        const result = await getTaskChildren(api, 'task-parent')

        expect(api.getTasks).toHaveBeenCalledTimes(3)
        expect(api.getTasks).toHaveBeenCalledWith({ parentId: 'sub-1', limit: 1 })
        expect(result.childCount).toBe(2)
        expect(result.children?.map((c) => [c.id, c.hasChildren])).toEqual([
            ['sub-1', true],
            ['sub-2', false],
        ])
        expect(result.childrenError).toBeUndefined()
    })

    it('keeps the listing when a nesting probe fails', async () => {
        const first = { ...fixtures.tasks.child, id: 'sub-1' }
        const second = { ...fixtures.tasks.child, id: 'sub-2' }
        api.getTasks.mockImplementation(async (args) => {
            if (args?.parentId === 'task-parent') {
                return { results: [first, second], nextCursor: null }
            }
            if (args?.parentId === 'sub-2') {
                return { results: [], nextCursor: null }
            }
            throw new Error('Probe failed')
        })

        const result = await getTaskChildren(api, 'task-parent')

        expect(result.childCount).toBe(2)
        expect(result.children?.every((c) => c.hasChildren === false)).toBe(true)
        expect(result.childrenError).toBe('nesting unknown for 1 of 2 subtasks')
    })

    it('flags a truncated listing', async () => {
        api.getTasks.mockImplementation(async (args) =>
            args?.parentId === 'task-parent'
                ? { results: [fixtures.tasks.child], nextCursor: 'next-page' }
                : { results: [], nextCursor: null },
        )

        const result = await getTaskChildren(api, 'task-parent')

        expect(result.hasMoreChildren).toBe(true)
    })
})

describe('resolveChildren', () => {
    it('turns a failure into a reported error rather than a throw', async () => {
        const result = await resolveChildren(async () => {
            throw new Error('Rate limited')
        })

        expect(result).toEqual({ childrenError: 'Rate limited' })
    })

    it('stringifies a non-Error rejection', async () => {
        const result = await resolveChildren(async () => {
            throw 'boom'
        })

        expect(result).toEqual({ childrenError: 'boom' })
    })
})
