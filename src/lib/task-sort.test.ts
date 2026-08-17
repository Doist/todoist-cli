import { describe, expect, it } from 'vitest'
import type { Project, Task } from './api/core.js'
import type { SavedViewOptions } from './api/view-options.js'
import { CliError } from './errors.js'
import {
    buildProjectOrder,
    defaultDirectionFor,
    formatTaskSort,
    parseTaskSortDirection,
    parseTaskSortField,
    queryUsesDates,
    sortNeedsCollaborators,
    sortNeedsProjects,
    sortTasks,
    taskSortFromViewOptions,
} from './task-sort.js'

function makeTask(overrides: Partial<Task> & { id: string }): Task {
    return {
        content: overrides.id,
        priority: 1,
        projectId: 'proj-1',
        childOrder: 0,
        due: null,
        deadline: null,
        addedAt: new Date('2026-01-01T00:00:00Z'),
        responsibleUid: null,
        labels: [],
        ...overrides,
    } as Task
}

function makeProject(overrides: Partial<Project> & { id: string }): Project {
    return {
        name: overrides.id,
        childOrder: 0,
        parentId: null,
        inboxProject: false,
        ...overrides,
    } as Project
}

function ids(tasks: Task[]): string[] {
    return tasks.map((task) => task.id)
}

describe('sortTasks', () => {
    it('leads with priority for a filter that does not query dates', () => {
        const tasks = [
            makeTask({ id: 'p4' }),
            makeTask({ id: 'p1', priority: 4 }),
            makeTask({ id: 'p3', priority: 2 }),
        ]

        expect(ids(sortTasks(tasks, { field: 'default', direction: 'asc' }))).toEqual([
            'p1',
            'p3',
            'p4',
        ])
    })

    it('breaks priority ties by due date, then deadline, then project order', () => {
        const tasks = [
            makeTask({ id: 'no-date', projectId: 'proj-2' }),
            makeTask({ id: 'deadline', deadline: { date: '2026-03-01', lang: 'en' } }),
            makeTask({ id: 'later', due: { date: '2026-02-02', string: '', isRecurring: false } }),
            makeTask({ id: 'sooner', due: { date: '2026-02-01', string: '', isRecurring: false } }),
            makeTask({ id: 'first-project' }),
        ]

        const order = buildProjectOrder([
            makeProject({ id: 'proj-1', childOrder: 0 }),
            makeProject({ id: 'proj-2', childOrder: 1 }),
        ])

        expect(ids(sortTasks(tasks, { field: 'default', direction: 'asc' }, order))).toEqual([
            'sooner',
            'later',
            'deadline',
            'first-project',
            'no-date',
        ])
    })

    it('leads with date for a filter that queries dates', () => {
        const tasks = [
            makeTask({
                id: 'p1-later',
                priority: 4,
                due: { date: '2026-02-02', string: '', isRecurring: false },
            }),
            makeTask({
                id: 'p4-sooner',
                due: { date: '2026-02-01', string: '', isRecurring: false },
            }),
        ]

        expect(
            ids(sortTasks(tasks, { field: 'default', direction: 'asc' }, { dateDriven: true })),
        ).toEqual(['p4-sooner', 'p1-later'])
    })

    it('falls back to the deadline when a date-driven task has no due date', () => {
        const tasks = [
            makeTask({
                id: 'due-later',
                due: { date: '2026-02-03', string: '', isRecurring: false },
            }),
            makeTask({ id: 'deadline-sooner', deadline: { date: '2026-02-01', lang: 'en' } }),
        ]

        expect(
            ids(sortTasks(tasks, { field: 'default', direction: 'asc' }, { dateDriven: true })),
        ).toEqual(['deadline-sooner', 'due-later'])
    })

    it('sorts all-day tasks ahead of timed tasks on the same day', () => {
        const tasks = [
            makeTask({
                id: 'timed',
                due: {
                    date: '2026-02-01',
                    datetime: '2026-02-01T09:00:00',
                    string: '',
                    isRecurring: false,
                },
            }),
            makeTask({
                id: 'all-day',
                due: { date: '2026-02-01', string: '', isRecurring: false },
            }),
        ]

        expect(ids(sortTasks(tasks, { field: 'date', direction: 'asc' }))).toEqual([
            'all-day',
            'timed',
        ])
    })

    it('orders a zoned datetime by the instant it falls on', () => {
        // Noon in Tokyo is 03:00 UTC, so it lands between the all-day task and
        // a floating 09:00, which the CLI reads in the local zone (UTC here).
        const tasks = [
            makeTask({
                id: 'floating-9am',
                due: {
                    date: '2026-02-01',
                    datetime: '2026-02-01T09:00:00',
                    string: '',
                    isRecurring: false,
                },
            }),
            makeTask({
                id: 'tokyo-noon',
                due: {
                    date: '2026-02-01',
                    datetime: '2026-02-01T12:00:00+09:00',
                    timezone: 'Asia/Tokyo',
                    string: '',
                    isRecurring: false,
                },
            }),
            makeTask({
                id: 'all-day',
                due: { date: '2026-02-01', string: '', isRecurring: false },
            }),
        ]

        expect(ids(sortTasks(tasks, { field: 'date', direction: 'asc' }))).toEqual([
            'all-day',
            'tokyo-noon',
            'floating-9am',
        ])
    })

    it('parks undated tasks at the end, and at the front when reversed', () => {
        const tasks = [
            makeTask({ id: 'undated' }),
            makeTask({ id: 'dated', due: { date: '2026-02-01', string: '', isRecurring: false } }),
        ]

        expect(ids(sortTasks(tasks, { field: 'date', direction: 'asc' }))).toEqual([
            'dated',
            'undated',
        ])
        expect(ids(sortTasks(tasks, { field: 'date', direction: 'desc' }))).toEqual([
            'undated',
            'dated',
        ])
    })

    it('sorts priority p1 first when descending', () => {
        const tasks = [
            makeTask({ id: 'p3', priority: 2 }),
            makeTask({ id: 'p1', priority: 4 }),
            makeTask({ id: 'p4' }),
        ]

        expect(ids(sortTasks(tasks, { field: 'priority', direction: 'desc' }))).toEqual([
            'p1',
            'p3',
            'p4',
        ])
        expect(ids(sortTasks(tasks, { field: 'priority', direction: 'asc' }))).toEqual([
            'p4',
            'p3',
            'p1',
        ])
    })

    it('keeps secondary criteria in default order when the primary is reversed', () => {
        const tasks = [
            makeTask({ id: 'b-p4', content: 'Beta' }),
            makeTask({ id: 'a-p1', content: 'Alpha', priority: 4 }),
            makeTask({ id: 'a-p4', content: 'Alpha' }),
        ]

        // Z-A on the name, but the two "Alpha" tasks stay p1 before p4.
        expect(ids(sortTasks(tasks, { field: 'name', direction: 'desc' }))).toEqual([
            'b-p4',
            'a-p1',
            'a-p4',
        ])
    })

    it('sorts by name, date added, and deadline', () => {
        const tasks = [
            makeTask({
                id: 'charlie',
                content: 'Charlie',
                addedAt: new Date('2026-01-03T00:00:00Z'),
                deadline: { date: '2026-05-01', lang: 'en' },
            }),
            makeTask({
                id: 'alpha',
                content: 'alpha',
                addedAt: new Date('2026-01-02T00:00:00Z'),
                deadline: { date: '2026-04-01', lang: 'en' },
            }),
            makeTask({
                id: 'bravo',
                content: 'Bravo',
                addedAt: new Date('2026-01-01T00:00:00Z'),
                deadline: { date: '2026-06-01', lang: 'en' },
            }),
        ]

        expect(ids(sortTasks(tasks, { field: 'name', direction: 'asc' }))).toEqual([
            'alpha',
            'bravo',
            'charlie',
        ])
        expect(ids(sortTasks(tasks, { field: 'date-added', direction: 'asc' }))).toEqual([
            'bravo',
            'alpha',
            'charlie',
        ])
        expect(ids(sortTasks(tasks, { field: 'deadline', direction: 'asc' }))).toEqual([
            'alpha',
            'charlie',
            'bravo',
        ])
    })

    it('sorts by assignee name and parks unassigned tasks last', () => {
        const tasks = [
            makeTask({ id: 'unassigned' }),
            makeTask({ id: 'zoe', responsibleUid: 'user-z' }),
            makeTask({ id: 'ana', responsibleUid: 'user-a' }),
        ]
        const names: Record<string, string> = { 'user-a': 'Ana', 'user-z': 'Zoe' }

        expect(
            ids(
                sortTasks(
                    tasks,
                    { field: 'assignee', direction: 'asc' },
                    {
                        assigneeName: (task) =>
                            task.responsibleUid ? names[task.responsibleUid] : null,
                    },
                ),
            ),
        ).toEqual(['ana', 'zoe', 'unassigned'])
    })

    it('moves unassigned tasks to the front when the assignee sort is reversed', () => {
        const tasks = [
            makeTask({ id: 'unassigned' }),
            makeTask({ id: 'zoe', responsibleUid: 'user-z' }),
            makeTask({ id: 'ana', responsibleUid: 'user-a' }),
        ]
        const names: Record<string, string> = { 'user-a': 'Ana', 'user-z': 'Zoe' }

        expect(
            ids(
                sortTasks(
                    tasks,
                    { field: 'assignee', direction: 'desc' },
                    {
                        assigneeName: (task) =>
                            task.responsibleUid ? names[task.responsibleUid] : null,
                    },
                ),
            ),
        ).toEqual(['unassigned', 'zoe', 'ana'])
    })

    it('sorts by workspace, personal projects first', () => {
        const order = buildProjectOrder([
            makeProject({ id: 'personal-1', childOrder: 0 }),
            makeProject({ id: 'ws-a-1', workspaceId: 'ws-a', childOrder: 0 }),
            makeProject({ id: 'ws-b-1', workspaceId: 'ws-b', childOrder: 0 }),
        ])
        const tasks = [
            makeTask({ id: 'in-ws-b', projectId: 'ws-b-1' }),
            makeTask({ id: 'in-personal', projectId: 'personal-1' }),
            makeTask({ id: 'in-ws-a', projectId: 'ws-a-1' }),
        ]

        expect(ids(sortTasks(tasks, { field: 'workspace', direction: 'asc' }, order))).toEqual([
            'in-personal',
            'in-ws-a',
            'in-ws-b',
        ])
        expect(ids(sortTasks(tasks, { field: 'workspace', direction: 'desc' }, order))).toEqual([
            'in-ws-b',
            'in-ws-a',
            'in-personal',
        ])
    })

    it('leaves the API order untouched for "none"', () => {
        const tasks = [
            makeTask({ id: 'second', priority: 1 }),
            makeTask({ id: 'first', priority: 4 }),
        ]
        const sorted = sortTasks(tasks, { field: 'none', direction: 'asc' })

        expect(ids(sorted)).toEqual(['second', 'first'])
        // A copy, so a caller reversing the result can't reorder the input.
        expect(sorted).not.toBe(tasks)
    })

    it('does not mutate the input list', () => {
        const tasks = [makeTask({ id: 'p4' }), makeTask({ id: 'p1', priority: 4 })]

        sortTasks(tasks, { field: 'default', direction: 'asc' })

        expect(ids(tasks)).toEqual(['p4', 'p1'])
    })
})

describe('buildProjectOrder', () => {
    it('lays projects out as Inbox, personal tree, then workspaces', () => {
        const order = buildProjectOrder([
            makeProject({ id: 'ws-b', workspaceId: 'ws-2', childOrder: 0 }),
            makeProject({ id: 'child', parentId: 'personal', childOrder: 0 }),
            makeProject({ id: 'ws-a', workspaceId: 'ws-1', childOrder: 0 }),
            makeProject({ id: 'personal', childOrder: 5 }),
            makeProject({ id: 'inbox', inboxProject: true, childOrder: 9 }),
        ])

        const byPosition = [...order.projectIndex.entries()]
            .sort((a, b) => a[1] - b[1])
            .map(([id]) => id)

        expect(byPosition).toEqual(['inbox', 'personal', 'child', 'ws-a', 'ws-b'])
        expect(order.workspaceIndex.get('personal')).toBe(0)
        expect(order.workspaceIndex.get('ws-a')).toBe(1)
        expect(order.workspaceIndex.get('ws-b')).toBe(2)
    })
})

describe('taskSortFromViewOptions', () => {
    function makeViewOptions(overrides: Partial<SavedViewOptions>): SavedViewOptions {
        return {
            viewType: 'FILTER',
            objectId: 'filter-1',
            sortedBy: null,
            sortOrder: null,
            groupedBy: null,
            viewMode: 'LIST',
            ...overrides,
        }
    }

    it('reads the saved sorting', () => {
        expect(
            taskSortFromViewOptions(makeViewOptions({ sortedBy: 'PRIORITY', sortOrder: 'DESC' })),
        ).toEqual({ field: 'priority', direction: 'desc' })
        expect(
            taskSortFromViewOptions(makeViewOptions({ sortedBy: 'DUE_DATE', sortOrder: 'ASC' })),
        ).toEqual({ field: 'date', direction: 'asc' })
    })

    it('treats a missing view, a null sort, and MANUAL as the Todoist default', () => {
        expect(taskSortFromViewOptions(undefined).field).toBe('default')
        expect(taskSortFromViewOptions(makeViewOptions({})).field).toBe('default')
        expect(taskSortFromViewOptions(makeViewOptions({ sortedBy: 'MANUAL' })).field).toBe(
            'default',
        )
    })

    it('falls back to the per-field direction when the view has none', () => {
        expect(taskSortFromViewOptions(makeViewOptions({ sortedBy: 'PRIORITY' })).direction).toBe(
            'desc',
        )
        expect(taskSortFromViewOptions(makeViewOptions({ sortedBy: 'DUE_DATE' })).direction).toBe(
            'asc',
        )
    })
})

describe('queryUsesDates', () => {
    it.each([
        'today',
        'due before: next week',
        'overdue | today',
        '@work & 7 days',
        'no date',
        'deadline: today',
    ])('treats %s as date-driven', (query) => {
        expect(queryUsesDates(query)).toBe(true)
    })

    it.each(['##work & p4 & !subtask', '@waiting', '#Marketing & p1', 'search: invoice'])(
        'treats %s as priority-driven',
        (query) => {
            expect(queryUsesDates(query)).toBe(false)
        },
    )

    it('ignores date words inside project and label names', () => {
        expect(queryUsesDates('#May Launch')).toBe(false)
        expect(queryUsesDates('@monday-meeting & p1')).toBe(false)
    })

    it('ignores date words inside a search term', () => {
        expect(queryUsesDates('search: due diligence')).toBe(false)
        expect(queryUsesDates('search: today notes & p1')).toBe(false)
        // The search operand ends at the operator, so a real date query still counts.
        expect(queryUsesDates('search: invoice & today')).toBe(true)
    })
})

describe('sort option parsing', () => {
    it('accepts known fields and directions case-insensitively', () => {
        expect(parseTaskSortField('Priority')).toBe('priority')
        expect(parseTaskSortField(' date-added ')).toBe('date-added')
        expect(parseTaskSortDirection('DESC')).toBe('desc')
    })

    it('rejects unknown values with a CliError', () => {
        expect(() => parseTaskSortField('due')).toThrow(CliError)
        expect(() => parseTaskSortDirection('descending')).toThrow(CliError)
    })

    it('defaults priority to descending and everything else to ascending', () => {
        expect(defaultDirectionFor('priority')).toBe('desc')
        expect(defaultDirectionFor('date')).toBe('asc')
    })

    it('knows which sorts need extra lookups', () => {
        // Every sort tie-breaks on the default hierarchy, which reads project
        // order, so only the unsorted path can skip the project fetch.
        expect(sortNeedsProjects('name')).toBe(true)
        expect(sortNeedsProjects('assignee')).toBe(true)
        expect(sortNeedsProjects('none')).toBe(false)
        expect(sortNeedsCollaborators('assignee')).toBe(true)
        expect(sortNeedsCollaborators('default')).toBe(false)
    })

    it('describes the applied sort', () => {
        expect(formatTaskSort({ field: 'default', direction: 'asc' })).toBe('Todoist default')
        expect(formatTaskSort({ field: 'priority', direction: 'desc' })).toBe('Priority (p1 first)')
    })
})
