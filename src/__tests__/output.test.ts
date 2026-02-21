import type { Task } from '@doist/todoist-api-typescript'
import { afterEach, describe, expect, it } from 'vitest'
import {
    formatDue,
    formatError,
    formatJson,
    formatNdjson,
    formatNextCursorFooter,
    formatPaginatedJson,
    formatPaginatedNdjson,
    formatPriority,
    formatTaskRow,
    formatTaskView,
    isAccessible,
} from '../lib/output.js'
import { fixtures } from './helpers/fixtures.js'

describe('formatPriority', () => {
    it('maps API priority 4 to p1 (highest)', () => {
        const result = formatPriority(4)
        expect(result).toContain('p1')
    })

    it('maps API priority 3 to p2', () => {
        const result = formatPriority(3)
        expect(result).toContain('p2')
    })

    it('maps API priority 2 to p3', () => {
        const result = formatPriority(2)
        expect(result).toContain('p3')
    })

    it('maps API priority 1 to p4 (lowest)', () => {
        const result = formatPriority(1)
        expect(result).toContain('p4')
    })

    it('handles unknown priority as p4', () => {
        const result = formatPriority(99)
        expect(result).toContain('p4')
    })
})

describe('formatDue', () => {
    it('returns empty string for null due', () => {
        expect(formatDue(null)).toBe('')
    })

    it('returns empty string for undefined due', () => {
        expect(formatDue(undefined)).toBe('')
    })

    it('prefers due.string over due.date', () => {
        const due = { date: '2026-01-09', string: 'today', isRecurring: false }
        expect(formatDue(due)).toBe('today')
    })

    it('falls back to due.date when string is empty', () => {
        const due = { date: '2026-01-09', string: '', isRecurring: false }
        expect(formatDue(due)).toBe('2026-01-09')
    })

    it('uses date when string is undefined', () => {
        const due = { date: '2026-01-15', isRecurring: false } as unknown as Task['due']
        expect(formatDue(due)).toBe('2026-01-15')
    })
})

describe('formatTaskRow', () => {
    it('returns two-line format with indented content on first line', () => {
        const task = fixtures.tasks.basic
        const result = formatTaskRow({ task })
        const lines = result.split('\n')
        expect(lines).toHaveLength(2)
        expect(lines[0]).toBe(`  ${task.content}`)
    })

    it('includes metadata on indented second line', () => {
        const task = fixtures.tasks.basic
        const result = formatTaskRow({ task })
        const lines = result.split('\n')
        expect(lines[1]).toMatch(/^\s{2}/)
        expect(lines[1]).toContain(`id:${task.id}`)
    })

    it('includes due date in metadata line when present', () => {
        const task = fixtures.tasks.withDue
        const result = formatTaskRow({ task })
        const lines = result.split('\n')
        expect(lines[1]).toContain('today')
    })

    it('includes project name in metadata line when provided', () => {
        const task = fixtures.tasks.basic
        const result = formatTaskRow({ task, projectName: 'Work' })
        const lines = result.split('\n')
        expect(lines[1]).toContain('Work')
    })

    it('omits project name when not provided', () => {
        const task = fixtures.tasks.basic
        const result = formatTaskRow({ task })
        expect(result).not.toContain('Inbox')
    })

    it('adds extra indentation when indent > 0', () => {
        const task = fixtures.tasks.basic
        const result = formatTaskRow({ task, indent: 1 })
        const lines = result.split('\n')
        expect(lines[0]).toBe(`    ${task.content}`)
        expect(lines[1]).toMatch(/^\s{4}/)
    })

    it('adds multiple levels of indentation', () => {
        const task = fixtures.tasks.basic
        const result = formatTaskRow({ task, indent: 2 })
        const lines = result.split('\n')
        expect(lines[0]).toBe(`      ${task.content}`)
        expect(lines[1]).toMatch(/^\s{6}/)
    })

    it('adds due: prefix when accessible is true', () => {
        const task = fixtures.tasks.withDue
        const result = formatTaskRow({ task, accessible: true })
        const lines = result.split('\n')
        expect(lines[1]).toContain('due:today')
    })

    it('adds deadline: prefix when accessible is true', () => {
        const task = {
            ...fixtures.tasks.basic,
            deadline: { date: '2026-03-15', lang: 'en' },
        } as Task
        const result = formatTaskRow({ task, accessible: true })
        const lines = result.split('\n')
        expect(lines[1]).toContain('deadline:2026-03-15')
    })

    it('adds ~ prefix to duration when accessible is true', () => {
        const task = {
            ...fixtures.tasks.basic,
            duration: { amount: 90, unit: 'minute' as const },
        } as Task
        const result = formatTaskRow({ task, accessible: true })
        const lines = result.split('\n')
        expect(lines[1]).toContain('~1h30m')
    })

    it('does not add prefixes when accessible is false', () => {
        const task = {
            ...fixtures.tasks.withDue,
            deadline: { date: '2026-03-15', lang: 'en' },
            duration: { amount: 60, unit: 'minute' as const },
        } as Task
        const result = formatTaskRow({ task, accessible: false })
        const lines = result.split('\n')
        expect(lines[1]).not.toContain('due:')
        expect(lines[1]).not.toContain('deadline:')
        expect(lines[1]).not.toContain('~')
        expect(lines[1]).toContain('today')
        expect(lines[1]).toContain('2026-03-15')
        expect(lines[1]).toContain('1h')
    })
})

describe('isAccessible', () => {
    const originalArgv = process.argv
    const originalEnv = process.env.TD_ACCESSIBLE

    afterEach(() => {
        process.argv = originalArgv
        if (originalEnv === undefined) {
            delete process.env.TD_ACCESSIBLE
        } else {
            process.env.TD_ACCESSIBLE = originalEnv
        }
    })

    it('returns true when TD_ACCESSIBLE=1', () => {
        process.env.TD_ACCESSIBLE = '1'
        expect(isAccessible()).toBe(true)
    })

    it('returns true when --accessible is in argv', () => {
        process.argv = ['node', 'td', 'today', '--accessible']
        expect(isAccessible()).toBe(true)
    })

    it('returns false by default', () => {
        delete process.env.TD_ACCESSIBLE
        process.argv = ['node', 'td', 'today']
        expect(isAccessible()).toBe(false)
    })
})

describe('formatTaskView', () => {
    it('shows task content as header', () => {
        const task = fixtures.tasks.basic
        const result = formatTaskView({ task })
        expect(result).toContain(task.content)
    })

    it('shows task ID', () => {
        const task = fixtures.tasks.basic
        const result = formatTaskView({ task })
        expect(result).toContain('ID:')
        expect(result).toContain(task.id)
    })

    it('shows priority', () => {
        const task = fixtures.tasks.withDue
        const result = formatTaskView({ task })
        expect(result).toContain('Priority:')
    })

    it('shows project name when provided', () => {
        const task = fixtures.tasks.basic
        const project = fixtures.projects.work
        const result = formatTaskView({ task, project })
        expect(result).toContain('Project:')
        expect(result).toContain('Work')
    })

    it('shows projectId when project not provided', () => {
        const task = fixtures.tasks.basic
        const result = formatTaskView({ task })
        expect(result).toContain('Project:')
        expect(result).toContain(task.projectId)
    })

    it('shows due date when present', () => {
        const task = fixtures.tasks.withDue
        const result = formatTaskView({ task })
        expect(result).toContain('Due:')
        expect(result).toContain('today')
    })

    it('omits due date when not present', () => {
        const task = fixtures.tasks.basic
        const result = formatTaskView({ task })
        expect(result).not.toContain('Due:')
    })

    it('shows labels when present', () => {
        const task = fixtures.tasks.withDescription
        const result = formatTaskView({ task })
        expect(result).toContain('Labels:')
        expect(result).toContain('urgent')
        expect(result).toContain('home')
    })

    it('omits labels when empty', () => {
        const task = fixtures.tasks.basic
        const result = formatTaskView({ task })
        expect(result).not.toContain('Labels:')
    })

    it('shows description when present', () => {
        const task = fixtures.tasks.withDescription
        const result = formatTaskView({ task })
        expect(result).toContain('Description:')
        expect(result).toContain('Some detailed description here')
    })

    it('omits description when empty', () => {
        const task = fixtures.tasks.basic
        const result = formatTaskView({ task })
        expect(result).not.toContain('Description:')
    })

    it('shows metadata section when full=true', () => {
        const task = { ...fixtures.tasks.basic, addedAt: '2026-01-01T00:00:00Z' }
        const result = formatTaskView({ task, full: true })
        expect(result).toContain('Metadata')
        expect(result).toContain('Created:')
        expect(result).toContain('URL:')
    })

    it('omits metadata section when full=false', () => {
        const task = fixtures.tasks.basic
        const result = formatTaskView({ task, full: false })
        expect(result).not.toContain('Metadata')
    })

    it('shows type for uncompletable tasks', () => {
        const task = { ...fixtures.tasks.basic, isUncompletable: true }
        const result = formatTaskView({ task })
        expect(result).toContain('Type:')
        expect(result).toContain('reference (uncompletable)')
    })

    it('omits type for completable tasks', () => {
        const task = { ...fixtures.tasks.basic, isUncompletable: false }
        const result = formatTaskView({ task })
        expect(result).not.toContain('Type:')
    })

    it('shows parent task name when parentTask provided', () => {
        const task = { ...fixtures.tasks.basic, parentId: 'parent-123' }
        const parentTask = {
            ...fixtures.tasks.basic,
            id: 'parent-123',
            content: 'Parent Task',
        }
        const result = formatTaskView({ task, parentTask })
        expect(result).toContain('Parent:')
        expect(result).toContain('Parent Task (id:parent-123)')
    })

    it('omits parent line when parentTask not provided', () => {
        const task = fixtures.tasks.basic
        const result = formatTaskView({ task })
        expect(result).not.toContain('Parent:')
    })

    it('shows subtask count when > 0', () => {
        const task = fixtures.tasks.basic
        const result = formatTaskView({ task, subtaskCount: 3 })
        expect(result).toContain('Subtasks: 3 active')
    })

    it('omits subtask line when subtaskCount is 0', () => {
        const task = fixtures.tasks.basic
        const result = formatTaskView({ task, subtaskCount: 0 })
        expect(result).not.toContain('Subtasks:')
    })

    it('omits subtask line when subtaskCount not provided', () => {
        const task = fixtures.tasks.basic
        const result = formatTaskView({ task })
        expect(result).not.toContain('Subtasks:')
    })
})

describe('formatJson', () => {
    it('returns full object when type is undefined', () => {
        const task = fixtures.tasks.basic
        const result = JSON.parse(formatJson(task))
        expect(result).toEqual(task)
    })

    it('returns full object when full=true', () => {
        const task = fixtures.tasks.basic
        const result = JSON.parse(formatJson(task, 'task', true))
        expect(result).toEqual(task)
    })

    it('adds webUrl when showUrl=true', () => {
        const task = fixtures.tasks.basic
        const result = JSON.parse(formatJson(task, 'task', true, true))
        expect(result).toEqual({
            ...task,
            webUrl: 'https://app.todoist.com/app/task/task-1',
        })
    })

    it('picks essential fields for task type', () => {
        const task = fixtures.tasks.basic
        const result = JSON.parse(formatJson(task, 'task'))
        expect(result.id).toBe(task.id)
        expect(result.content).toBe(task.content)
        expect(result.priority).toBe(task.priority)
        expect(result.projectId).toBe(task.projectId)
        expect(result.isUncompletable).toBe(task.isUncompletable)
        expect(result).not.toHaveProperty('checked')
    })

    it('picks essential fields for project type', () => {
        const project = fixtures.projects.work
        const result = JSON.parse(formatJson(project, 'project'))
        expect(result.id).toBe(project.id)
        expect(result.name).toBe(project.name)
        expect(result.color).toBe(project.color)
        expect(result.isFavorite).toBe(project.isFavorite)
    })

    it('picks essential fields for label type', () => {
        const label = fixtures.labels.urgent
        const result = JSON.parse(formatJson(label, 'label'))
        expect(result.id).toBe(label.id)
        expect(result.name).toBe(label.name)
        expect(result.color).toBe(label.color)
        expect(result.isFavorite).toBe(label.isFavorite)
    })

    it('handles arrays correctly', () => {
        const tasks = [fixtures.tasks.basic, fixtures.tasks.withDue]
        const result = JSON.parse(formatJson(tasks, 'task'))
        expect(result).toHaveLength(2)
        expect(result[0].id).toBe('task-1')
        expect(result[1].id).toBe('task-2')
    })
})

describe('formatNdjson', () => {
    it('outputs one JSON object per line', () => {
        const tasks = [fixtures.tasks.basic, fixtures.tasks.withDue]
        const result = formatNdjson(tasks)
        const lines = result.split('\n')
        expect(lines).toHaveLength(2)
        expect(JSON.parse(lines[0]).id).toBe('task-1')
        expect(JSON.parse(lines[1]).id).toBe('task-2')
    })

    it('picks essential fields when type provided', () => {
        const tasks = [fixtures.tasks.basic]
        const result = formatNdjson(tasks, 'task')
        const parsed = JSON.parse(result)
        expect(parsed.id).toBe('task-1')
        expect(parsed).not.toHaveProperty('checked')
    })

    it('returns full objects when full=true', () => {
        const tasks = [fixtures.tasks.basic]
        const result = formatNdjson(tasks, 'task', true)
        const parsed = JSON.parse(result)
        expect(parsed).toEqual(fixtures.tasks.basic)
    })

    it('adds webUrl when showUrl=true', () => {
        const tasks = [fixtures.tasks.basic]
        const result = formatNdjson(tasks, 'task', true, true)
        const parsed = JSON.parse(result)
        expect(parsed).toEqual({
            ...fixtures.tasks.basic,
            webUrl: 'https://app.todoist.com/app/task/task-1',
        })
    })

    it('handles empty array', () => {
        const result = formatNdjson([])
        expect(result).toBe('')
    })
})

describe('formatPaginatedJson', () => {
    it('includes nextCursor in output', () => {
        const data = {
            results: [fixtures.tasks.basic],
            nextCursor: 'cursor-123',
        }
        const result = JSON.parse(formatPaginatedJson(data, 'task'))
        expect(result.nextCursor).toBe('cursor-123')
        expect(result.results).toHaveLength(1)
    })

    it('sets nextCursor to null when no more pages', () => {
        const data = {
            results: [fixtures.tasks.basic],
            nextCursor: null,
        }
        const result = JSON.parse(formatPaginatedJson(data, 'task'))
        expect(result.nextCursor).toBeNull()
    })

    it('picks essential fields for results', () => {
        const data = {
            results: [fixtures.tasks.basic],
            nextCursor: null,
        }
        const result = JSON.parse(formatPaginatedJson(data, 'task'))
        expect(result.results[0]).not.toHaveProperty('checked')
    })

    it('returns full objects when full=true', () => {
        const data = {
            results: [fixtures.tasks.basic],
            nextCursor: null,
        }
        const result = JSON.parse(formatPaginatedJson(data, 'task', true))
        expect(result.results[0]).toEqual(fixtures.tasks.basic)
    })

    it('adds webUrl when showUrl=true', () => {
        const data = {
            results: [fixtures.tasks.basic],
            nextCursor: null,
        }
        const result = JSON.parse(formatPaginatedJson(data, 'task', true, true))
        expect(result.results[0]).toEqual({
            ...fixtures.tasks.basic,
            webUrl: 'https://app.todoist.com/app/task/task-1',
        })
    })
})

describe('formatPaginatedNdjson', () => {
    it('appends _meta line when nextCursor exists', () => {
        const data = {
            results: [fixtures.tasks.basic],
            nextCursor: 'cursor-456',
        }
        const result = formatPaginatedNdjson(data, 'task')
        const lines = result.split('\n')
        expect(lines).toHaveLength(2)
        const meta = JSON.parse(lines[1])
        expect(meta._meta).toBe(true)
        expect(meta.nextCursor).toBe('cursor-456')
    })

    it('omits _meta line when nextCursor is null', () => {
        const data = {
            results: [fixtures.tasks.basic],
            nextCursor: null,
        }
        const result = formatPaginatedNdjson(data, 'task')
        const lines = result.split('\n')
        expect(lines).toHaveLength(1)
        expect(result).not.toContain('_meta')
    })

    it('picks essential fields for results', () => {
        const data = {
            results: [fixtures.tasks.basic],
            nextCursor: null,
        }
        const result = formatPaginatedNdjson(data, 'task')
        const parsed = JSON.parse(result)
        expect(parsed).not.toHaveProperty('checked')
    })
})

describe('formatError', () => {
    it('formats error with code and message', () => {
        const result = formatError('NOT_FOUND', 'Task not found')
        expect(result).toContain('Error: NOT_FOUND')
        expect(result).toContain('Task not found')
    })

    it('includes hints when provided', () => {
        const result = formatError('INVALID_REF', 'Invalid reference', [
            'Use id:xxx format',
            'Check the spelling',
        ])
        expect(result).toContain('Use id:xxx format')
        expect(result).toContain('Check the spelling')
    })

    it('omits hints section when no hints', () => {
        const result = formatError('ERROR', 'Something went wrong')
        expect(result).not.toContain('-')
    })

    it('handles empty hints array', () => {
        const result = formatError('ERROR', 'Something went wrong', [])
        expect(result).not.toContain('-')
    })
})

describe('formatNextCursorFooter', () => {
    it('returns empty string when nextCursor is null', () => {
        expect(formatNextCursorFooter(null)).toBe('')
    })

    it('returns hint message when cursor exists', () => {
        const result = formatNextCursorFooter('some-cursor')
        expect(result).toContain('more items exist')
        expect(result).toContain('--all')
    })
})
