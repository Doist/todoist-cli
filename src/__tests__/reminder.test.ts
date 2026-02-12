import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api/core.js', () => ({
    getApi: vi.fn(),
}))

vi.mock('../lib/api/reminders.js', () => ({
    getTaskReminders: vi.fn(),
    fetchReminders: vi.fn(),
    addReminder: vi.fn(),
    updateReminder: vi.fn(),
    deleteReminder: vi.fn(),
}))

import { registerReminderCommand } from '../commands/reminder.js'
import { getApi } from '../lib/api/core.js'
import {
    addReminder,
    deleteReminder,
    fetchReminders,
    getTaskReminders,
    updateReminder,
} from '../lib/api/reminders.js'

const mockGetApi = vi.mocked(getApi)
const mockGetTaskReminders = vi.mocked(getTaskReminders)
const mockFetchReminders = vi.mocked(fetchReminders)
const mockAddReminder = vi.mocked(addReminder)
const mockUpdateReminder = vi.mocked(updateReminder)
const mockDeleteReminder = vi.mocked(deleteReminder)

function createMockApi() {
    return {
        getTasks: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        getTask: vi.fn(),
    }
}

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerReminderCommand(program)
    return program
}

describe('reminder list', () => {
    let mockApi: ReturnType<typeof createMockApi>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('lists reminders for a task', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({ id: 'task-1', content: 'Buy milk' })
        mockGetTaskReminders.mockResolvedValue([
            {
                id: 'rem-1',
                itemId: 'task-1',
                type: 'absolute',
                minuteOffset: 30,
                isDeleted: false,
            },
            {
                id: 'rem-2',
                itemId: 'task-1',
                type: 'absolute',
                due: { date: '2024-01-15T10:00:00' },
                isDeleted: false,
            },
        ])

        await program.parseAsync(['node', 'td', 'reminder', 'list', 'id:task-1'])

        expect(mockGetTaskReminders).toHaveBeenCalledWith('task-1')
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('30m before due'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('at 2024-01-15 10:00'))
        consoleSpy.mockRestore()
    })

    it('shows "No reminders." when empty', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({ id: 'task-1', content: 'Test' })
        mockGetTaskReminders.mockResolvedValue([])

        await program.parseAsync(['node', 'td', 'reminder', 'list', 'id:task-1'])

        expect(consoleSpy).toHaveBeenCalledWith('No reminders.')
        consoleSpy.mockRestore()
    })

    it('outputs JSON with --json flag', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({ id: 'task-1', content: 'Test' })
        mockGetTaskReminders.mockResolvedValue([
            {
                id: 'rem-1',
                itemId: 'task-1',
                type: 'absolute',
                minuteOffset: 60,
                isDeleted: false,
            },
        ])

        await program.parseAsync(['node', 'td', 'reminder', 'list', 'id:task-1', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.results).toBeDefined()
        expect(parsed.results[0].minuteOffset).toBe(60)
        consoleSpy.mockRestore()
    })
})

describe('reminder add', () => {
    let mockApi: ReturnType<typeof createMockApi>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('adds reminder with --before offset', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({
            id: 'task-1',
            content: 'Buy milk',
            due: { date: '2024-01-15T10:00:00' },
        })
        mockAddReminder.mockResolvedValue('rem-new')

        await program.parseAsync(['node', 'td', 'reminder', 'add', 'id:task-1', '--before', '30m'])

        expect(mockAddReminder).toHaveBeenCalledWith({
            itemId: 'task-1',
            minuteOffset: 30,
            due: undefined,
        })
        expect(consoleSpy).toHaveBeenCalledWith('Added reminder: 30m before due')
        consoleSpy.mockRestore()
    })

    it('adds reminder with --at datetime', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({ id: 'task-1', content: 'Buy milk' })
        mockAddReminder.mockResolvedValue('rem-new')

        await program.parseAsync([
            'node',
            'td',
            'reminder',
            'add',
            'id:task-1',
            '--at',
            '2024-01-15 10:00',
        ])

        expect(mockAddReminder).toHaveBeenCalledWith({
            itemId: 'task-1',
            minuteOffset: undefined,
            due: { date: '2024-01-15T10:00:00' },
        })
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('at 2024-01-15'))
        consoleSpy.mockRestore()
    })

    it('parses hour durations', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({
            id: 'task-1',
            content: 'Test',
            due: { date: '2024-01-15T10:00:00' },
        })
        mockAddReminder.mockResolvedValue('rem-new')

        await program.parseAsync(['node', 'td', 'reminder', 'add', 'id:task-1', '--before', '1h'])

        expect(mockAddReminder).toHaveBeenCalledWith({
            itemId: 'task-1',
            minuteOffset: 60,
            due: undefined,
        })
        consoleSpy.mockRestore()
    })

    it('shows ID after creation', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({
            id: 'task-1',
            content: 'Test',
            due: { date: '2024-01-15T10:00:00' },
        })
        mockAddReminder.mockResolvedValue('rem-xyz')

        await program.parseAsync(['node', 'td', 'reminder', 'add', 'id:task-1', '--before', '15m'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('rem-xyz'))
        consoleSpy.mockRestore()
    })

    it('errors when neither --before nor --at specified', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({ id: 'task-1', content: 'Test' })

        await program.parseAsync(['node', 'td', 'reminder', 'add', 'id:task-1'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('MISSING_TIME'))
        expect(mockAddReminder).not.toHaveBeenCalled()
        consoleSpy.mockRestore()
    })

    it('errors when both --before and --at specified', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({ id: 'task-1', content: 'Test' })

        await program.parseAsync([
            'node',
            'td',
            'reminder',
            'add',
            'id:task-1',
            '--before',
            '30m',
            '--at',
            '2024-01-15 10:00',
        ])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('CONFLICTING_OPTIONS'))
        expect(mockAddReminder).not.toHaveBeenCalled()
        consoleSpy.mockRestore()
    })

    it('errors on invalid duration format', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({
            id: 'task-1',
            content: 'Test',
            due: { date: '2024-01-15T10:00:00' },
        })

        await program.parseAsync([
            'node',
            'td',
            'reminder',
            'add',
            'id:task-1',
            '--before',
            'invalid',
        ])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('INVALID_DURATION'))
        expect(mockAddReminder).not.toHaveBeenCalled()
        consoleSpy.mockRestore()
    })

    it('errors when --before used on task without due date', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({
            id: 'task-1',
            content: 'Test',
            due: null,
        })

        await program.parseAsync(['node', 'td', 'reminder', 'add', 'id:task-1', '--before', '30m'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('NO_DUE_DATE'))
        expect(mockAddReminder).not.toHaveBeenCalled()
        consoleSpy.mockRestore()
    })

    it('errors when --before used on task with date-only due', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({
            id: 'task-1',
            content: 'Test',
            due: { date: '2024-01-15' },
        })

        await program.parseAsync(['node', 'td', 'reminder', 'add', 'id:task-1', '--before', '30m'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('NO_DUE_TIME'))
        expect(mockAddReminder).not.toHaveBeenCalled()
        consoleSpy.mockRestore()
    })
})

describe('reminder update', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('updates reminder with new offset', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockUpdateReminder.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'reminder', 'update', 'id:rem-1', '--before', '1h'])

        expect(mockUpdateReminder).toHaveBeenCalledWith('rem-1', {
            minuteOffset: 60,
            due: undefined,
        })
        expect(consoleSpy).toHaveBeenCalledWith('Updated reminder: 1h before due')
        consoleSpy.mockRestore()
    })

    it('updates reminder with new datetime', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockUpdateReminder.mockResolvedValue(undefined)

        await program.parseAsync([
            'node',
            'td',
            'reminder',
            'update',
            'id:rem-1',
            '--at',
            '2024-01-16 09:00',
        ])

        expect(mockUpdateReminder).toHaveBeenCalledWith('rem-1', {
            minuteOffset: undefined,
            due: { date: '2024-01-16T09:00:00' },
        })
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('at 2024-01-16'))
        consoleSpy.mockRestore()
    })

    it('rejects plain text references', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync([
                'node',
                'td',
                'reminder',
                'update',
                'my-reminder',
                '--before',
                '1h',
            ]),
        ).rejects.toThrow('INVALID_REF')
    })
})

describe('reminder delete', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('shows dry-run without --yes', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchReminders.mockResolvedValue([
            {
                id: 'rem-1',
                itemId: 'task-1',
                type: 'absolute',
                minuteOffset: 30,
                isDeleted: false,
            },
        ])

        await program.parseAsync(['node', 'td', 'reminder', 'delete', 'id:rem-1'])

        expect(mockDeleteReminder).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith('Would delete reminder: 30m before due')
        expect(consoleSpy).toHaveBeenCalledWith('Use --yes to confirm.')
        consoleSpy.mockRestore()
    })

    it('deletes reminder with --yes', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchReminders.mockResolvedValue([
            {
                id: 'rem-123',
                itemId: 'task-1',
                type: 'absolute',
                minuteOffset: 60,
                isDeleted: false,
            },
        ])
        mockDeleteReminder.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'reminder', 'delete', 'id:rem-123', '--yes'])

        expect(mockDeleteReminder).toHaveBeenCalledWith('rem-123')
        expect(consoleSpy).toHaveBeenCalledWith('Deleted reminder: 1h before due')
        consoleSpy.mockRestore()
    })

    it('rejects plain text references', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'td', 'reminder', 'delete', 'my-reminder', '--yes']),
        ).rejects.toThrow('INVALID_REF')
    })

    it('errors if reminder not found', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchReminders.mockResolvedValue([])

        await program.parseAsync([
            'node',
            'td',
            'reminder',
            'delete',
            'id:rem-nonexistent',
            '--yes',
        ])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('NOT_FOUND'))
        expect(mockDeleteReminder).not.toHaveBeenCalled()
        consoleSpy.mockRestore()
    })
})
