import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/api/core.js', () => ({
    getApi: vi.fn(),
}))

vi.mock('../../lib/api/reminders.js', () => ({
    fetchReminders: vi.fn(),
    addReminder: vi.fn(),
    updateReminder: vi.fn(),
    deleteReminder: vi.fn(),
    getReminderById: vi.fn(),
    getLocationReminderById: vi.fn(),
    addLocationReminder: vi.fn(),
    updateLocationReminder: vi.fn(),
    deleteLocationReminder: vi.fn(),
}))

import {
    addLocationReminder,
    addReminder,
    deleteLocationReminder,
    deleteReminder,
    fetchReminders,
    getLocationReminderById,
    getReminderById,
    updateLocationReminder,
    updateReminder,
} from '../../lib/api/reminders.js'
import { mockConsoleLog } from '../../test-support/console-spy.js'
import { registerReminderCommand } from './index.js'

import { setupApiMock } from '../../test-support/api-mock.js'
import { type MockApi } from '../../test-support/mock-api.js'
import { createTestProgram } from '../../test-support/program.js'

const mockFetchReminders = vi.mocked(fetchReminders)
const mockAddReminder = vi.mocked(addReminder)
const mockUpdateReminder = vi.mocked(updateReminder)
const mockDeleteReminder = vi.mocked(deleteReminder)
const mockGetReminderById = vi.mocked(getReminderById)
const mockGetLocationReminderById = vi.mocked(getLocationReminderById)
const mockAddLocationReminder = vi.mocked(addLocationReminder)
const mockUpdateLocationReminder = vi.mocked(updateLocationReminder)
const mockDeleteLocationReminder = vi.mocked(deleteLocationReminder)

function createProgram() {
    return createTestProgram(registerReminderCommand)
}

describe('reminder list', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('lists reminders for a task', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockApi.getTask.mockResolvedValue({ id: 'task-1', content: 'Buy milk' })
        mockApi.getReminders.mockResolvedValue({
            results: [
                {
                    id: 'rem-1',
                    notifyUid: 'user-1',
                    itemId: 'task-1',
                    type: 'relative',
                    minuteOffset: 30,
                    isDeleted: false,
                },
                {
                    id: 'rem-2',
                    notifyUid: 'user-1',
                    itemId: 'task-1',
                    type: 'absolute',
                    due: {
                        date: '2024-01-15T10:00:00',
                        isRecurring: false,
                        string: '2024-01-15 10:00',
                    },
                    isDeleted: false,
                },
            ],
            nextCursor: null,
        })
        mockApi.getLocationReminders.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'reminder', 'list', 'id:task-1'])

        expect(mockApi.getReminders).toHaveBeenCalledWith(
            expect.objectContaining({ taskId: 'task-1' }),
        )
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('30m before due'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('at 2024-01-15 10:00'))
    })

    it('lists all reminders when no task specified', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockApi.getReminders.mockResolvedValue({
            results: [
                {
                    id: 'rem-1',
                    notifyUid: 'user-1',
                    itemId: 'task-1',
                    type: 'relative',
                    minuteOffset: 15,
                    isDeleted: false,
                },
            ],
            nextCursor: null,
        })
        mockApi.getLocationReminders.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'reminder', 'list'])

        expect(mockApi.getReminders).toHaveBeenCalledWith(
            expect.not.objectContaining({ taskId: expect.anything() }),
        )
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('15m before due'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('task:task-1'))
    })

    it('shows location reminders alongside time reminders', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockApi.getReminders.mockResolvedValue({ results: [], nextCursor: null })
        mockApi.getLocationReminders.mockResolvedValue({
            results: [
                {
                    id: 'loc-1',
                    notifyUid: 'user-1',
                    itemId: 'task-1',
                    type: 'location',
                    name: 'Office',
                    locLat: '37.7749',
                    locLong: '-122.4194',
                    locTrigger: 'on_enter',
                    radius: 100,
                    isDeleted: false,
                },
            ],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'reminder', 'list'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Office'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('on enter'))
    })

    it('shows "No reminders." when empty', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockApi.getTask.mockResolvedValue({ id: 'task-1', content: 'Test' })
        mockApi.getReminders.mockResolvedValue({ results: [], nextCursor: null })
        mockApi.getLocationReminders.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'reminder', 'list', 'id:task-1'])

        expect(consoleSpy).toHaveBeenCalledWith('No reminders.')
    })

    it('outputs JSON with --json flag', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockApi.getTask.mockResolvedValue({ id: 'task-1', content: 'Test' })
        mockApi.getReminders.mockResolvedValue({
            results: [
                {
                    id: 'rem-1',
                    notifyUid: 'user-1',
                    itemId: 'task-1',
                    type: 'relative',
                    minuteOffset: 60,
                    isDeleted: false,
                },
            ],
            nextCursor: null,
        })
        mockApi.getLocationReminders.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'reminder', 'list', 'id:task-1', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.results).toBeDefined()
        expect(parsed.results[0].minuteOffset).toBe(60)
    })

    it('accepts --task flag instead of positional arg', async () => {
        const program = createProgram()
        mockConsoleLog()

        mockApi.getTask.mockResolvedValue({ id: 'task-1', content: 'Buy milk' })
        mockApi.getReminders.mockResolvedValue({ results: [], nextCursor: null })
        mockApi.getLocationReminders.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'reminder', 'list', '--task', 'id:task-1'])

        expect(mockApi.getTask).toHaveBeenCalledWith('task-1')
    })

    it('errors when both positional and --task are provided', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync([
                'node',
                'td',
                'reminder',
                'list',
                'id:task-1',
                '--task',
                'id:task-2',
            ]),
        ).rejects.toThrow('Cannot specify task both as argument and --task flag')
    })

    it('filters to time-based reminders with --type time', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockApi.getReminders.mockResolvedValue({
            results: [
                {
                    id: 'rem-1',
                    notifyUid: 'user-1',
                    itemId: 'task-1',
                    type: 'relative',
                    minuteOffset: 15,
                    isDeleted: false,
                },
            ],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'reminder', 'list', '--type', 'time'])

        expect(mockApi.getReminders).toHaveBeenCalled()
        expect(mockApi.getLocationReminders).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('15m before due'))
    })

    it('filters to location reminders with --type location', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockApi.getLocationReminders.mockResolvedValue({
            results: [
                {
                    id: 'loc-1',
                    notifyUid: 'user-1',
                    itemId: 'task-1',
                    type: 'location',
                    name: 'Home',
                    locLat: '40.7128',
                    locLong: '-74.0060',
                    locTrigger: 'on_leave',
                    radius: 200,
                    isDeleted: false,
                },
            ],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'reminder', 'list', '--type', 'location'])

        expect(mockApi.getLocationReminders).toHaveBeenCalled()
        expect(mockApi.getReminders).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Home'))
    })

    it('errors when --cursor is used without --type', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'td', 'reminder', 'list', '--cursor', 'abc123']),
        ).rejects.toThrow('--cursor requires --type')
    })

    it('shows [urgent] badge for urgent reminders', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockApi.getReminders.mockResolvedValue({
            results: [
                {
                    id: 'rem-1',
                    notifyUid: 'user-1',
                    itemId: 'task-1',
                    type: 'relative',
                    minuteOffset: 30,
                    isUrgent: true,
                    isDeleted: false,
                },
            ],
            nextCursor: null,
        })
        mockApi.getLocationReminders.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'reminder', 'list'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[urgent]'))
    })

    it('does not show task context when filtered by task', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockApi.getTask.mockResolvedValue({ id: 'task-1', content: 'Buy milk' })
        mockApi.getReminders.mockResolvedValue({
            results: [
                {
                    id: 'rem-1',
                    notifyUid: 'user-1',
                    itemId: 'task-1',
                    type: 'relative',
                    minuteOffset: 10,
                    isDeleted: false,
                },
            ],
            nextCursor: null,
        })
        mockApi.getLocationReminders.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'reminder', 'list', 'id:task-1'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('10m before due'))
        expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('task:'))
    })
})

describe('reminder add --json', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('outputs created reminder as JSON with --before', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockApi.getTask.mockResolvedValue({
            id: 'task-1',
            content: 'Buy milk',
            due: { date: '2024-01-15T10:00:00' },
        })
        mockAddReminder.mockResolvedValue('rem-new')

        await program.parseAsync([
            'node',
            'td',
            'reminder',
            'add',
            'id:task-1',
            '--before',
            '30m',
            '--json',
        ])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.id).toBe('rem-new')
        expect(parsed.itemId).toBe('task-1')
        expect(parsed.type).toBe('relative')
        expect(parsed.minuteOffset).toBe(30)
        expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Added reminder:'))
    })

    it('outputs created reminder as JSON with --at', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

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
            '--json',
        ])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.id).toBe('rem-new')
        expect(parsed.type).toBe('absolute')
    })
})

describe('reminder add', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('adds reminder with --before offset', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

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
    })

    it('adds reminder with --at datetime', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

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
    })

    it('parses hour durations', async () => {
        const program = createProgram()
        mockConsoleLog()

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
    })

    it('shows ID after creation', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockApi.getTask.mockResolvedValue({
            id: 'task-1',
            content: 'Test',
            due: { date: '2024-01-15T10:00:00' },
        })
        mockAddReminder.mockResolvedValue('rem-xyz')

        await program.parseAsync(['node', 'td', 'reminder', 'add', 'id:task-1', '--before', '15m'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('rem-xyz'))
    })

    it('errors when neither --before nor --at specified', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'td', 'reminder', 'add', 'id:task-1']),
        ).rejects.toHaveProperty('code', 'MISSING_TIME')
        expect(mockAddReminder).not.toHaveBeenCalled()
    })

    it('errors when both --before and --at specified', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync([
                'node',
                'td',
                'reminder',
                'add',
                'id:task-1',
                '--before',
                '30m',
                '--at',
                '2024-01-15 10:00',
            ]),
        ).rejects.toHaveProperty('code', 'CONFLICTING_OPTIONS')
        expect(mockAddReminder).not.toHaveBeenCalled()
    })

    it('errors on invalid duration format', async () => {
        const program = createProgram()

        mockApi.getTask.mockResolvedValue({
            id: 'task-1',
            content: 'Test',
            due: { date: '2024-01-15T10:00:00' },
        })

        await expect(
            program.parseAsync([
                'node',
                'td',
                'reminder',
                'add',
                'id:task-1',
                '--before',
                'invalid',
            ]),
        ).rejects.toHaveProperty('code', 'INVALID_DURATION')
        expect(mockAddReminder).not.toHaveBeenCalled()
    })

    it('errors when --before used on task without due date', async () => {
        const program = createProgram()

        mockApi.getTask.mockResolvedValue({
            id: 'task-1',
            content: 'Test',
            due: null,
        })

        await expect(
            program.parseAsync(['node', 'td', 'reminder', 'add', 'id:task-1', '--before', '30m']),
        ).rejects.toHaveProperty('code', 'NO_DUE_DATE')
        expect(mockAddReminder).not.toHaveBeenCalled()
    })

    it('errors when --before used on task with date-only due', async () => {
        const program = createProgram()

        mockApi.getTask.mockResolvedValue({
            id: 'task-1',
            content: 'Test',
            due: { date: '2024-01-15' },
        })

        await expect(
            program.parseAsync(['node', 'td', 'reminder', 'add', 'id:task-1', '--before', '30m']),
        ).rejects.toHaveProperty('code', 'NO_DUE_TIME')
        expect(mockAddReminder).not.toHaveBeenCalled()
    })

    it('accepts --task flag instead of positional arg', async () => {
        const program = createProgram()
        mockConsoleLog()

        mockApi.getTask.mockResolvedValue({
            id: 'task-1',
            content: 'Buy milk',
            due: { date: '2024-01-15T10:00:00' },
        })
        mockAddReminder.mockResolvedValue('rem-new')

        await program.parseAsync([
            'node',
            'td',
            'reminder',
            'add',
            '--task',
            'id:task-1',
            '--before',
            '30m',
        ])

        expect(mockAddReminder).toHaveBeenCalledWith({
            itemId: 'task-1',
            minuteOffset: 30,
            due: undefined,
        })
    })

    it('errors when both positional and --task are provided for add', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync([
                'node',
                'td',
                'reminder',
                'add',
                'id:task-1',
                '--task',
                'id:task-2',
                '--before',
                '30m',
            ]),
        ).rejects.toThrow('Cannot specify task both as argument and --task flag')
    })

    it('passes --urgent through and shows [urgent] in output', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

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
            '--urgent',
        ])

        expect(mockAddReminder).toHaveBeenCalledWith(
            expect.objectContaining({ itemId: 'task-1', isUrgent: true }),
        )
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[urgent]'))
    })
})

describe('reminder update', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('updates reminder with new offset', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockUpdateReminder.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'reminder', 'update', 'id:rem-1', '--before', '1h'])

        expect(mockUpdateReminder).toHaveBeenCalledWith('rem-1', {
            minuteOffset: 60,
            due: undefined,
        })
        expect(consoleSpy).toHaveBeenCalledWith('Updated reminder: 1h before due (id:rem-1)')
    })

    it('updates reminder with new datetime', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

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
        ).rejects.toHaveProperty('code', 'INVALID_REF')
    })

    it('toggles urgency alone without --before or --at', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockUpdateReminder.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'reminder', 'update', 'id:rem-1', '--no-urgent'])

        expect(mockUpdateReminder).toHaveBeenCalledWith(
            'rem-1',
            expect.objectContaining({ isUrgent: false }),
        )
        expect(consoleSpy).toHaveBeenCalledWith('Updated reminder: marked not urgent (id:rem-1)')
    })

    it('shows [urgent] in confirmation when time and --urgent are combined', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockUpdateReminder.mockResolvedValue(undefined)

        await program.parseAsync([
            'node',
            'td',
            'reminder',
            'update',
            'id:rem-1',
            '--before',
            '1h',
            '--urgent',
        ])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('1h before due'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[urgent]'))
    })

    it('outputs JSON with --json', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockUpdateReminder.mockResolvedValue(undefined)
        mockGetReminderById.mockResolvedValue({
            id: 'rem-1',
            notifyUid: 'user-1',
            itemId: 'task-1',
            type: 'relative',
            minuteOffset: 60,
            isUrgent: true,
            isDeleted: false,
            // biome-ignore lint/suspicious/noExplicitAny: mock
        } as any)

        await program.parseAsync([
            'node',
            'td',
            'reminder',
            'update',
            'id:rem-1',
            '--urgent',
            '--json',
        ])

        const firstCall = consoleSpy.mock.calls[0]?.[0] as string
        const parsed = JSON.parse(firstCall)
        expect(parsed.id).toBe('rem-1')
        expect(parsed.isUrgent).toBe(true)
    })
})

describe('reminder delete', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('shows dry-run without --yes', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockFetchReminders.mockResolvedValue([
            {
                id: 'rem-1',
                itemId: 'task-1',
                type: 'relative',
                minuteOffset: 30,
                isDeleted: false,
            },
        ])

        await program.parseAsync(['node', 'td', 'reminder', 'delete', 'id:rem-1'])

        expect(mockDeleteReminder).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith('Would delete reminder: 30m before due')
        expect(consoleSpy).toHaveBeenCalledWith('Use --yes to confirm.')
    })

    it('deletes reminder with --yes', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockFetchReminders.mockResolvedValue([
            {
                id: 'rem-123',
                itemId: 'task-1',
                type: 'relative',
                minuteOffset: 60,
                isDeleted: false,
            },
        ])
        mockDeleteReminder.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'reminder', 'delete', 'id:rem-123', '--yes'])

        expect(mockDeleteReminder).toHaveBeenCalledWith('rem-123')
        expect(consoleSpy).toHaveBeenCalledWith('Deleted reminder: 1h before due (id:rem-123)')
    })

    it('rejects plain text references', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'td', 'reminder', 'delete', 'my-reminder', '--yes']),
        ).rejects.toHaveProperty('code', 'INVALID_REF')
    })

    it('errors if reminder not found', async () => {
        const program = createProgram()

        mockFetchReminders.mockResolvedValue([])

        await expect(
            program.parseAsync(['node', 'td', 'reminder', 'delete', 'id:rem-nonexistent', '--yes']),
        ).rejects.toHaveProperty('code', 'NOT_FOUND')
        expect(mockDeleteReminder).not.toHaveBeenCalled()
    })
})

describe('reminder --dry-run', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('reminder add --dry-run previews without calling API', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockApi.getTask.mockResolvedValue({ id: 'task-1', content: 'Test task' })

        await program.parseAsync([
            'node',
            'td',
            'reminder',
            'add',
            'id:task-1',
            '--at',
            '2026-03-20T10:00',
            '--dry-run',
        ])

        expect(mockAddReminder).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would add reminder'))
    })

    it('reminder delete --dry-run previews without calling API', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockFetchReminders.mockResolvedValue([
            {
                id: 'reminder-1',
                itemId: 'task-1',
                type: 'relative',
                minuteOffset: 30,
                isDeleted: false,
            },
        ])

        await program.parseAsync(['node', 'td', 'reminder', 'delete', 'id:reminder-1', '--dry-run'])

        expect(mockDeleteReminder).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would delete reminder'))
    })

    it('reminder update --dry-run previews without calling API', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        await program.parseAsync([
            'node',
            'td',
            'reminder',
            'update',
            'id:reminder-1',
            '--before',
            '1h',
            '--dry-run',
        ])

        expect(mockUpdateReminder).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would update reminder'))
    })
})

describe('reminder get', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('fetches a time-based reminder by id', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockGetReminderById.mockResolvedValue({
            id: 'rem-1',
            notifyUid: 'user-1',
            itemId: 'task-1',
            type: 'relative',
            minuteOffset: 30,
            isDeleted: false,
            // biome-ignore lint/suspicious/noExplicitAny: mock
        } as any)

        await program.parseAsync(['node', 'td', 'reminder', 'get', 'id:rem-1'])

        expect(mockGetReminderById).toHaveBeenCalledWith('rem-1')
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('30m before due'))
    })

    it('outputs JSON with --json', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockGetReminderById.mockResolvedValue({
            id: 'rem-1',
            notifyUid: 'user-1',
            itemId: 'task-1',
            type: 'absolute',
            due: { date: '2024-01-15T10:00:00', isRecurring: false, string: '2024-01-15 10:00' },
            isDeleted: false,
            // biome-ignore lint/suspicious/noExplicitAny: mock
        } as any)

        await program.parseAsync(['node', 'td', 'reminder', 'get', 'id:rem-1', '--json'])

        const firstCall = consoleSpy.mock.calls[0]?.[0] as string
        expect(firstCall).toContain('"id": "rem-1"')
        expect(firstCall).toContain('"type": "absolute"')
    })

    it('rejects invalid id ref', async () => {
        const program = createProgram()
        await expect(
            program.parseAsync(['node', 'td', 'reminder', 'get', 'not-a-valid-id!']),
        ).rejects.toMatchObject({ code: 'INVALID_REF' })
    })

    it('shows [urgent] badge for urgent reminders', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockGetReminderById.mockResolvedValue({
            id: 'rem-1',
            notifyUid: 'user-1',
            itemId: 'task-1',
            type: 'relative',
            minuteOffset: 30,
            isUrgent: true,
            isDeleted: false,
            // biome-ignore lint/suspicious/noExplicitAny: mock
        } as any)

        await program.parseAsync(['node', 'td', 'reminder', 'get', 'id:rem-1'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[urgent]'))
    })

    it('includes isUrgent in default --json output', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockGetReminderById.mockResolvedValue({
            id: 'rem-1',
            notifyUid: 'user-1',
            itemId: 'task-1',
            type: 'relative',
            minuteOffset: 30,
            isUrgent: true,
            isDeleted: false,
            // biome-ignore lint/suspicious/noExplicitAny: mock
        } as any)

        await program.parseAsync(['node', 'td', 'reminder', 'get', 'id:rem-1', '--json'])

        const firstCall = consoleSpy.mock.calls[0]?.[0] as string
        expect(firstCall).toContain('"isUrgent": true')
    })
})

describe('reminder location add', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    function setupTask() {
        mockApi.getTask.mockResolvedValue({
            id: 'task-1',
            content: 'Buy milk',
            // biome-ignore lint/suspicious/noExplicitAny: mock
        } as any)
    }

    it('adds a location reminder', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()
        setupTask()

        mockAddLocationReminder.mockResolvedValue({
            id: 'loc-1',
            notifyUid: 'user-1',
            itemId: 'task-1',
            type: 'location',
            name: 'Grocery',
            locLat: '40.7128',
            locLong: '-74.0060',
            locTrigger: 'on_enter',
            radius: 100,
            isDeleted: false,
            // biome-ignore lint/suspicious/noExplicitAny: mock
        } as any)

        await program.parseAsync([
            'node',
            'td',
            'reminder',
            'location',
            'add',
            'id:task-1',
            '--name',
            'Grocery',
            '--lat',
            '40.7128',
            '--long',
            '-74.0060',
            '--trigger',
            'on_enter',
            '--radius',
            '100',
        ])

        expect(mockAddLocationReminder).toHaveBeenCalledWith({
            taskId: 'task-1',
            name: 'Grocery',
            locLat: '40.7128',
            locLong: '-74.0060',
            locTrigger: 'on_enter',
            radius: 100,
        })
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('Added location reminder: Grocery'),
        )
    })

    it('requires --name', async () => {
        const program = createProgram()
        setupTask()

        await expect(
            program.parseAsync([
                'node',
                'td',
                'reminder',
                'location',
                'add',
                'id:task-1',
                '--lat',
                '1',
                '--long',
                '2',
                '--trigger',
                'on_enter',
            ]),
        ).rejects.toMatchObject({ code: 'MISSING_NAME' })
    })

    it('rejects invalid --trigger', async () => {
        const program = createProgram()
        setupTask()

        await expect(
            program.parseAsync([
                'node',
                'td',
                'reminder',
                'location',
                'add',
                'id:task-1',
                '--name',
                'x',
                '--lat',
                '1',
                '--long',
                '2',
                '--trigger',
                'bogus',
            ]),
        ).rejects.toMatchObject({ code: 'INVALID_TRIGGER' })
    })

    it('rejects out-of-range --lat', async () => {
        const program = createProgram()
        setupTask()

        await expect(
            program.parseAsync([
                'node',
                'td',
                'reminder',
                'location',
                'add',
                'id:task-1',
                '--name',
                'x',
                '--lat',
                '91',
                '--long',
                '0',
                '--trigger',
                'on_enter',
            ]),
        ).rejects.toMatchObject({ code: 'INVALID_LAT' })
    })

    it('rejects invalid --radius', async () => {
        const program = createProgram()
        setupTask()

        await expect(
            program.parseAsync([
                'node',
                'td',
                'reminder',
                'location',
                'add',
                'id:task-1',
                '--name',
                'x',
                '--lat',
                '1',
                '--long',
                '2',
                '--trigger',
                'on_enter',
                '--radius',
                '0',
            ]),
        ).rejects.toMatchObject({ code: 'INVALID_RADIUS' })
    })

    it('--dry-run does not call the API', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()
        setupTask()

        await program.parseAsync([
            'node',
            'td',
            'reminder',
            'location',
            'add',
            'id:task-1',
            '--name',
            'Grocery',
            '--lat',
            '1',
            '--long',
            '2',
            '--trigger',
            'on_enter',
            '--dry-run',
        ])

        expect(mockAddLocationReminder).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('Would add location reminder'),
        )
    })
})

describe('reminder location update', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('updates a subset of fields', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockUpdateLocationReminder.mockResolvedValue({
            id: 'loc-1',
            notifyUid: 'user-1',
            itemId: 'task-1',
            type: 'location',
            name: 'Grocery',
            locLat: '40.7128',
            locLong: '-74.0060',
            locTrigger: 'on_enter',
            radius: 200,
            isDeleted: false,
            // biome-ignore lint/suspicious/noExplicitAny: mock
        } as any)

        await program.parseAsync([
            'node',
            'td',
            'reminder',
            'location',
            'update',
            'id:loc-1',
            '--radius',
            '200',
        ])

        expect(mockUpdateLocationReminder).toHaveBeenCalledWith('loc-1', { radius: 200 })
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('Updated location reminder'),
        )
    })

    it('errors when no fields provided', async () => {
        const program = createProgram()
        await expect(
            program.parseAsync(['node', 'td', 'reminder', 'location', 'update', 'id:loc-1']),
        ).rejects.toMatchObject({ code: 'MISSING_UPDATE' })
    })

    it('outputs JSON with --json', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockUpdateLocationReminder.mockResolvedValue({
            id: 'loc-1',
            notifyUid: 'user-1',
            itemId: 'task-1',
            type: 'location',
            name: 'Grocery',
            locLat: '40.7128',
            locLong: '-74.0060',
            locTrigger: 'on_enter',
            radius: 300,
            isDeleted: false,
            // biome-ignore lint/suspicious/noExplicitAny: mock
        } as any)

        await program.parseAsync([
            'node',
            'td',
            'reminder',
            'location',
            'update',
            'id:loc-1',
            '--radius',
            '300',
            '--json',
        ])

        const firstCall = consoleSpy.mock.calls[0]?.[0] as string
        expect(firstCall).toContain('"id": "loc-1"')
        expect(firstCall).toContain('"radius": 300')
    })

    it('--dry-run does not call the API', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        await program.parseAsync([
            'node',
            'td',
            'reminder',
            'location',
            'update',
            'id:loc-1',
            '--name',
            'New',
            '--dry-run',
        ])

        expect(mockUpdateLocationReminder).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('Would update location reminder'),
        )
    })
})

describe('reminder location delete', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    function mockLocationReminder() {
        mockGetLocationReminderById.mockResolvedValue({
            id: 'loc-1',
            notifyUid: 'user-1',
            itemId: 'task-1',
            type: 'location',
            name: 'Grocery',
            locLat: '40.7128',
            locLong: '-74.0060',
            locTrigger: 'on_enter',
            radius: 100,
            isDeleted: false,
            // biome-ignore lint/suspicious/noExplicitAny: mock
        } as any)
    }

    it('requires --yes to delete', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()
        mockLocationReminder()

        await program.parseAsync(['node', 'td', 'reminder', 'location', 'delete', 'id:loc-1'])

        expect(mockDeleteLocationReminder).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('Would delete location reminder'),
        )
    })

    it('deletes with --yes', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()
        mockLocationReminder()

        await program.parseAsync([
            'node',
            'td',
            'reminder',
            'location',
            'delete',
            'id:loc-1',
            '--yes',
        ])

        expect(mockDeleteLocationReminder).toHaveBeenCalledWith('loc-1')
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('Deleted location reminder'),
        )
    })

    it('--dry-run previews without calling API', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()
        mockLocationReminder()

        await program.parseAsync([
            'node',
            'td',
            'reminder',
            'location',
            'delete',
            'id:loc-1',
            '--dry-run',
        ])

        expect(mockDeleteLocationReminder).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('Would delete location reminder'),
        )
    })
})

describe('reminder location get', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('fetches a location reminder by id', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockGetLocationReminderById.mockResolvedValue({
            id: 'loc-1',
            notifyUid: 'user-1',
            itemId: 'task-1',
            type: 'location',
            name: 'Grocery',
            locLat: '40.7128',
            locLong: '-74.0060',
            locTrigger: 'on_enter',
            radius: 100,
            isDeleted: false,
            // biome-ignore lint/suspicious/noExplicitAny: mock
        } as any)

        await program.parseAsync(['node', 'td', 'reminder', 'location', 'get', 'id:loc-1'])

        expect(mockGetLocationReminderById).toHaveBeenCalledWith('loc-1')
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Grocery'))
    })

    it('outputs JSON with --json', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockGetLocationReminderById.mockResolvedValue({
            id: 'loc-1',
            notifyUid: 'user-1',
            itemId: 'task-1',
            type: 'location',
            name: 'Grocery',
            locLat: '40.7128',
            locLong: '-74.0060',
            locTrigger: 'on_enter',
            radius: 100,
            isDeleted: false,
            // biome-ignore lint/suspicious/noExplicitAny: mock
        } as any)

        await program.parseAsync([
            'node',
            'td',
            'reminder',
            'location',
            'get',
            'id:loc-1',
            '--json',
        ])

        const firstCall = consoleSpy.mock.calls[0]?.[0] as string
        expect(firstCall).toContain('"id": "loc-1"')
        expect(firstCall).toContain('"name": "Grocery"')
    })
})
