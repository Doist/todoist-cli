import type { PersonalProject, Task } from '@doist/todoist-sdk'
import { beforeEach, describe, expect, it } from 'vitest'
import { fixtures } from '../test-support/fixtures.js'
import { createMockApi, type MockApi } from '../test-support/mock-api.js'
import { buildProjectChildren, CHILDREN_MAX, getTaskChildren, resolveChildren } from './children.js'

const { parent, child } = fixtures.projects

function project(overrides: Partial<PersonalProject>): PersonalProject {
    return { ...child, ...overrides } as PersonalProject
}

describe('buildProjectChildren', () => {
    it('returns direct children in child order, flagging the ones that nest further', () => {
        const result = buildProjectChildren(parent, [
            project({ id: 'child-b', parentId: parent.id, childOrder: 2 }),
            project({ id: 'child-a', parentId: parent.id, childOrder: 1 }),
            project({ id: 'grandchild', parentId: 'child-a' }),
            project({ id: 'unrelated', parentId: null }),
        ])

        expect(result.childCount).toBe(2)
        expect(result.children?.map((c) => [c.id, c.hasChildren])).toEqual([
            ['child-a', true],
            ['child-b', false],
        ])
        expect(result.hasMoreChildren).toBeUndefined()
    })

    it('reports zero for a project with no sub-projects', () => {
        expect(buildProjectChildren(parent, [project({ parentId: null })])).toEqual({
            childCount: 0,
            children: [],
        })
    })

    it('short-circuits workspace projects, which nest under folders', () => {
        const all = [project({ parentId: fixtures.projects.workspaceProject.id })]

        expect(buildProjectChildren(fixtures.projects.workspaceProject, all)).toEqual({
            childCount: 0,
            children: [],
        })
    })

    it('truncates past the cap and flags that more exist', () => {
        const all = Array.from({ length: CHILDREN_MAX + 5 }, (_, index) =>
            project({ id: `child-${index}`, parentId: parent.id, childOrder: index }),
        )

        const result = buildProjectChildren(parent, all)

        expect(result.childCount).toBe(CHILDREN_MAX)
        expect(result.hasMoreChildren).toBe(true)
    })
})

describe('getTaskChildren', () => {
    let api: MockApi

    const subtasks: Task[] = [
        { ...fixtures.tasks.child, id: 'sub-1' },
        { ...fixtures.tasks.child, id: 'sub-2' },
    ]

    /** Answers the direct-children call; `probe` handles each child's nesting probe. */
    function mockChildren(probe: (parentId: string) => Promise<{ results: Task[] }>) {
        api.getTasks.mockImplementation(async (args) =>
            args?.parentId === 'task-parent'
                ? { results: subtasks, nextCursor: null }
                : { ...(await probe(String(args?.parentId))), nextCursor: null },
        )
    }

    beforeEach(() => {
        api = createMockApi()
    })

    it('reports zero children for a leaf task without probing', async () => {
        api.getTasks.mockResolvedValue({ results: [], nextCursor: null })

        const result = await getTaskChildren(api, 'task-parent')

        expect(api.getTasks).toHaveBeenCalledExactlyOnceWith({
            parentId: 'task-parent',
            limit: CHILDREN_MAX,
        })
        expect(result).toMatchObject({ childCount: 0, children: [] })
    })

    it('probes each child once and flags the ones that nest further', async () => {
        mockChildren(async (id) => ({ results: id === 'sub-1' ? [fixtures.tasks.basic] : [] }))

        const result = await getTaskChildren(api, 'task-parent')

        expect(api.getTasks).toHaveBeenCalledTimes(3)
        expect(api.getTasks).toHaveBeenCalledWith({ parentId: 'sub-1', limit: 1 })
        expect(result.children?.map((c) => [c.id, c.hasChildren])).toEqual([
            ['sub-1', true],
            ['sub-2', false],
        ])
        expect(result.childrenError).toBeUndefined()
    })

    it('keeps the listing when a nesting probe fails', async () => {
        mockChildren(async (id) => {
            if (id === 'sub-1') throw new Error('Probe failed')
            return { results: [] }
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

        expect(await getTaskChildren(api, 'task-parent')).toMatchObject({ hasMoreChildren: true })
    })
})

describe('resolveChildren', () => {
    it('turns a failure into a reported error rather than a throw', async () => {
        const result = await resolveChildren(async () => {
            throw new Error('Rate limited')
        })

        expect(result).toEqual({ childrenError: 'Rate limited' })
    })
})
