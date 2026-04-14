import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/auth.js', () => ({
    getApiToken: vi.fn().mockResolvedValue('test-token'),
}))

import { fetchCompletedTasksForGoal } from '../lib/api/goal-tasks.js'

interface RawItem {
    id: string
    user_id: string
    project_id: string
    section_id: string | null
    parent_id: string | null
    added_by_uid: string | null
    assigned_by_uid: string | null
    responsible_uid: string | null
    labels: string[]
    deadline: null
    duration: null
    checked: boolean
    is_deleted: boolean
    added_at: string | null
    completed_at: string | null
    updated_at: string | null
    due: null
    priority: number
    child_order: number
    content: string
    description: string
    day_order: number
    is_collapsed: boolean
    goal_ids: string[]
}

function rawItem(id: string, goalIds: string[]): RawItem {
    return {
        id,
        user_id: 'u1',
        project_id: 'p1',
        section_id: null,
        parent_id: null,
        added_by_uid: 'u1',
        assigned_by_uid: null,
        responsible_uid: null,
        labels: [],
        deadline: null,
        duration: null,
        checked: true,
        is_deleted: false,
        added_at: '2026-01-01T00:00:00Z',
        completed_at: '2026-04-01T00:00:00Z',
        updated_at: '2026-04-01T00:00:00Z',
        due: null,
        priority: 1,
        child_order: 0,
        content: `Task ${id}`,
        description: '',
        day_order: -1,
        is_collapsed: false,
        goal_ids: goalIds,
    }
}

function jsonResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
    })
}

describe('fetchCompletedTasksForGoal', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns empty without calling the API when expectedCount is 0', async () => {
        const fetchImpl = vi.fn<typeof fetch>()
        const result = await fetchCompletedTasksForGoal({
            goalId: 'goal-1',
            limit: 50,
            expectedCount: 0,
            fetchImpl,
        })
        expect(result.tasks).toEqual([])
        expect(result.truncated).toBe(false)
        expect(fetchImpl).not.toHaveBeenCalled()
    })

    it('filters items by goal_ids membership', async () => {
        const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
            jsonResponse({
                items: [
                    rawItem('match-1', ['goal-1']),
                    rawItem('miss-1', ['goal-2']),
                    rawItem('match-2', ['goal-1', 'goal-2']),
                ],
                next_cursor: null,
            }),
        )

        const result = await fetchCompletedTasksForGoal({
            goalId: 'goal-1',
            limit: 50,
            expectedCount: 2,
            fetchImpl,
        })

        expect(result.tasks.map((t) => t.id)).toEqual(['match-1', 'match-2'])
        expect(result.truncated).toBe(false)
        // Should short-circuit after finding expectedCount matches.
        expect(fetchImpl).toHaveBeenCalledTimes(1)
    })

    it('sets limitReached (not truncated) when caller limit saturates before expectedCount', async () => {
        const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
            jsonResponse({
                items: [
                    rawItem('m1', ['goal-1']),
                    rawItem('m2', ['goal-1']),
                    rawItem('m3', ['goal-1']),
                    rawItem('m4', ['goal-1']),
                ],
                next_cursor: null,
            }),
        )

        const result = await fetchCompletedTasksForGoal({
            goalId: 'goal-1',
            limit: 2,
            expectedCount: 10,
            fetchImpl,
        })

        expect(result.tasks).toHaveLength(2)
        expect(result.limitReached).toBe(true)
        expect(result.truncated).toBe(false)
    })

    it('does not flag limitReached when the goal is fully returned', async () => {
        const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
            jsonResponse({
                items: [rawItem('m1', ['goal-1']), rawItem('m2', ['goal-1'])],
                next_cursor: null,
            }),
        )

        const result = await fetchCompletedTasksForGoal({
            goalId: 'goal-1',
            limit: 50,
            expectedCount: 2,
            fetchImpl,
        })

        expect(result.tasks).toHaveLength(2)
        expect(result.limitReached).toBe(false)
        expect(result.truncated).toBe(false)
    })

    it('stops after collecting expectedCount matches', async () => {
        const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
            jsonResponse({
                items: [
                    rawItem('m1', ['goal-1']),
                    rawItem('m2', ['goal-1']),
                    rawItem('m3', ['goal-1']),
                ],
                next_cursor: 'should-not-follow',
            }),
        )

        const result = await fetchCompletedTasksForGoal({
            goalId: 'goal-1',
            limit: 50,
            expectedCount: 2,
            fetchImpl,
        })

        expect(result.tasks).toHaveLength(2)
        expect(fetchImpl).toHaveBeenCalledTimes(1)
    })

    it('walks multiple windows when matches span the lookback horizon', async () => {
        const fetchImpl = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(
                jsonResponse({ items: [rawItem('recent', ['goal-1'])], next_cursor: null }),
            )
            .mockResolvedValueOnce(
                jsonResponse({ items: [rawItem('older', ['goal-1'])], next_cursor: null }),
            )
            .mockImplementation(async () => jsonResponse({ items: [], next_cursor: null }))

        const result = await fetchCompletedTasksForGoal({
            goalId: 'goal-1',
            limit: 10,
            expectedCount: 2,
            fetchImpl,
        })

        expect(result.tasks).toHaveLength(2)
        expect(result.truncated).toBe(false)
        expect(fetchImpl.mock.calls.length).toBeGreaterThanOrEqual(2)
    })

    it('marks truncated when MAX_WINDOWS is exhausted without finding expectedCount', async () => {
        const fetchImpl = vi
            .fn<typeof fetch>()
            .mockImplementation(async () => jsonResponse({ items: [], next_cursor: null }))

        const result = await fetchCompletedTasksForGoal({
            goalId: 'goal-1',
            limit: 10,
            expectedCount: 5,
            fetchImpl,
        })

        expect(result.tasks).toHaveLength(0)
        expect(result.truncated).toBe(true)
    })

    it('maps raw snake_case fields onto the SDK Task shape', async () => {
        const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
            jsonResponse({
                items: [rawItem('m1', ['goal-1'])],
                next_cursor: null,
            }),
        )

        const result = await fetchCompletedTasksForGoal({
            goalId: 'goal-1',
            limit: 10,
            expectedCount: 1,
            fetchImpl,
        })

        const task = result.tasks[0]
        expect(task.id).toBe('m1')
        expect(task.projectId).toBe('p1')
        expect(task.checked).toBe(true)
        expect(task.content).toBe('Task m1')
        expect(task.completedAt).toBeInstanceOf(Date)
    })

    it('throws an API error on non-2xx responses', async () => {
        const fetchImpl = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response('nope', { status: 500 }))

        await expect(
            fetchCompletedTasksForGoal({
                goalId: 'goal-1',
                limit: 10,
                expectedCount: 1,
                fetchImpl,
            }),
        ).rejects.toThrow(/Failed to fetch completed tasks/)
    })
})
