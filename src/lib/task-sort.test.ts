import type { ViewOptions as SavedViewOptions } from '@doist/todoist-sdk'
import { describe, expect, it } from 'vitest'
import type { Project, Task } from './api/core.js'
import { CliError } from './errors.js'
import {
    buildProjectOrder,
    defaultDirectionFor,
    formatTaskSort,
    parseTaskSortDirection,
    parseTaskSortField,
    queryUsesDates,
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
        defaultOrder: 0,
        parentId: null,
        inboxProject: false,
        ...overrides,
    } as Project
}

function ids(tasks: Task[]): string[] {
    return tasks.map((task) => task.id)
}

describe('sortTasks', () => {
    // The comparators live in the SDK and are tested there. What matters here
    // is the handoff: that each CLI concept reaches it as the right argument.

    it('asks for the priority-first hierarchy by default', () => {
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

    it('switches to the date-first hierarchy for a date-driven list', () => {
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

    it('passes a named sort through with its direction', () => {
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

    it('hands over the project and workspace maps it built', () => {
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

        // Project order is the default hierarchy's fourth criterion, and the
        // workspace buckets are a sort field of their own.
        expect(ids(sortTasks(tasks, { field: 'default', direction: 'asc' }, order))).toEqual([
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

    it('resolves assignee names through the callback it is given', () => {
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

    it('leaves the API order alone for "none", and never mutates the input', () => {
        const tasks = [
            makeTask({ id: 'second', priority: 1 }),
            makeTask({ id: 'first', priority: 4 }),
        ]
        const unsorted = sortTasks(tasks, { field: 'none', direction: 'asc' })

        expect(ids(unsorted)).toEqual(['second', 'first'])
        expect(unsorted).not.toBe(tasks)

        sortTasks(tasks, { field: 'default', direction: 'asc' })
        expect(ids(tasks)).toEqual(['second', 'first'])
    })
})

describe('buildProjectOrder', () => {
    it('orders workspace projects by defaultOrder, not childOrder', () => {
        // Workspace projects leave childOrder at 0 and carry their sidebar
        // position in defaultOrder.
        const order = buildProjectOrder([
            makeProject({ id: 'third', workspaceId: 'ws-1', childOrder: 0, defaultOrder: 2 }),
            makeProject({ id: 'first', workspaceId: 'ws-1', childOrder: 0, defaultOrder: 0 }),
            makeProject({ id: 'second', workspaceId: 'ws-1', childOrder: 0, defaultOrder: 1 }),
        ])

        const byPosition = [...order.projectOrder.entries()]
            .sort((a, b) => a[1] - b[1])
            .map(([id]) => id)
        expect(byPosition).toEqual(['first', 'second', 'third'])
    })

    it('orders the workspaces themselves by name when it has them', () => {
        const projects = [
            makeProject({ id: 'in-zebra', workspaceId: 'ws-z' }),
            makeProject({ id: 'in-acme', workspaceId: 'ws-a' }),
        ]
        const names = new Map([
            ['ws-z', 'Acme'],
            ['ws-a', 'Zebra'],
        ])

        // Without names the buckets fall back to id order, so ws-a leads.
        expect(buildProjectOrder(projects).workspaceOrder.get('in-acme')).toBe(1)
        // With them, "Acme" leads even though its id sorts last.
        expect(
            buildProjectOrder(projects, { workspaceNames: names }).workspaceOrder.get('in-zebra'),
        ).toBe(1)
    })

    it('lays projects out as Inbox, personal tree, then workspaces', () => {
        const order = buildProjectOrder([
            makeProject({ id: 'ws-b', workspaceId: 'ws-2', childOrder: 0 }),
            makeProject({ id: 'child', parentId: 'personal', childOrder: 0 }),
            makeProject({ id: 'ws-a', workspaceId: 'ws-1', childOrder: 0 }),
            makeProject({ id: 'personal', childOrder: 5 }),
            makeProject({ id: 'inbox', inboxProject: true, childOrder: 9 }),
        ])

        const byPosition = [...order.projectOrder.entries()]
            .sort((a, b) => a[1] - b[1])
            .map(([id]) => id)

        expect(byPosition).toEqual(['inbox', 'personal', 'child', 'ws-a', 'ws-b'])
        expect(order.workspaceOrder.get('personal')).toBe(0)
        expect(order.workspaceOrder.get('ws-a')).toBe(1)
        expect(order.workspaceOrder.get('ws-b')).toBe(2)
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
            isDeleted: false,
            ...overrides,
        } as SavedViewOptions
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
        // A name runs to the operator, so "date" here belongs to the project.
        expect(queryUsesDates('#due date')).toBe(false)
        expect(queryUsesDates('#due date & p1')).toBe(false)
        expect(queryUsesDates('#due date & today')).toBe(true)
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

    it('describes the applied sort', () => {
        expect(formatTaskSort({ field: 'default', direction: 'asc' })).toBe('Todoist default')
        expect(formatTaskSort({ field: 'priority', direction: 'desc' })).toBe('Priority (p1 first)')
    })
})
