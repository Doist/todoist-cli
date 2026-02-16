import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api/user-settings.js', () => ({
    fetchUserSettings: vi.fn(),
    updateUserSettings: vi.fn(),
}))

vi.mock('../lib/api/core.js', () => ({
    getApi: vi.fn(),
}))

vi.mock('../lib/api/filters.js', () => ({
    fetchFilters: vi.fn(),
}))

vi.mock('../lib/spinner.js', () => ({
    withSpinner: vi.fn((_opts: unknown, fn: () => Promise<unknown>) => fn()),
}))

import {
    DATE_FORMAT_CHOICES,
    DAY_CHOICES,
    parseDateFormat,
    parseDay,
    parseTheme,
    parseTimeFormat,
    registerSettingsCommand,
    THEME_CHOICES,
    TIME_FORMAT_CHOICES,
} from '../commands/settings.js'
import { getApi } from '../lib/api/core.js'
import { fetchFilters } from '../lib/api/filters.js'
import { fetchUserSettings, updateUserSettings } from '../lib/api/user-settings.js'

const mockFetchUserSettings = vi.mocked(fetchUserSettings)
const mockUpdateUserSettings = vi.mocked(updateUserSettings)
const mockGetApi = vi.mocked(getApi)
const mockFetchFilters = vi.mocked(fetchFilters)

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerSettingsCommand(program)
    return program
}

const defaultSettings = {
    timezone: 'Europe/London',
    timeFormat: 0, // 24h
    dateFormat: 0, // DD-MM-YYYY
    startDay: 1, // Monday
    theme: 6, // Blueberry
    autoReminder: 30,
    nextWeek: 1,
    startPage: 'today',
    reminderPush: true,
    reminderDesktop: true,
    reminderEmail: false,
    completedSoundDesktop: true,
    completedSoundMobile: true,
}

describe('settings view', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('displays settings in human-readable format', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchUserSettings.mockResolvedValue(defaultSettings)

        await program.parseAsync(['node', 'td', 'settings', 'view'])

        expect(mockFetchUserSettings).toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('General'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Europe/London'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('24h'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Monday'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Notifications'))
        consoleSpy.mockRestore()
    })

    it('outputs JSON with --json flag using human-friendly values', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchUserSettings.mockResolvedValue(defaultSettings)

        await program.parseAsync(['node', 'td', 'settings', 'view', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.timezone).toBe('Europe/London')
        expect(parsed.timeFormat).toBe('24h')
        expect(parsed.dateFormat).toBe('intl')
        expect(parsed.startDay).toBe('monday')
        expect(parsed.theme).toBe('blueberry')
        expect(parsed.reminderPush).toBe(true)
        consoleSpy.mockRestore()
    })

    it('formats 12h time format correctly', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchUserSettings.mockResolvedValue({
            ...defaultSettings,
            timeFormat: 1,
        })

        await program.parseAsync(['node', 'td', 'settings', 'view'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('12h'))
        consoleSpy.mockRestore()
    })

    it('formats US date format correctly', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchUserSettings.mockResolvedValue({
            ...defaultSettings,
            dateFormat: 1,
        })

        await program.parseAsync(['node', 'td', 'settings', 'view'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('MM-DD-YYYY'))
        consoleSpy.mockRestore()
    })
})

describe('settings view - start page name resolution', () => {
    let mockApi: {
        getProject: ReturnType<typeof vi.fn>
        getLabel: ReturnType<typeof vi.fn>
    }

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = {
            getProject: vi.fn(),
            getLabel: vi.fn(),
        }
        mockGetApi.mockResolvedValue(mockApi as never)
    })

    it('resolves project name in text output', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchUserSettings.mockResolvedValue({
            ...defaultSettings,
            startPage: 'project?id=abc123',
        })
        mockApi.getProject.mockResolvedValue({ id: 'abc123', name: 'My Project' })

        await program.parseAsync(['node', 'td', 'settings', 'view'])

        expect(mockApi.getProject).toHaveBeenCalledWith('abc123')
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('project?id=abc123 (My Project)'),
        )
        consoleSpy.mockRestore()
    })

    it('resolves project name in JSON output', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchUserSettings.mockResolvedValue({
            ...defaultSettings,
            startPage: 'project?id=abc123',
        })
        mockApi.getProject.mockResolvedValue({ id: 'abc123', name: 'My Project' })

        await program.parseAsync(['node', 'td', 'settings', 'view', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.startPage).toBe('project?id=abc123')
        expect(parsed.startPageName).toBe('My Project')
        consoleSpy.mockRestore()
    })

    it('resolves label name', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchUserSettings.mockResolvedValue({
            ...defaultSettings,
            startPage: 'label?id=label-1',
        })
        mockApi.getLabel.mockResolvedValue({ id: 'label-1', name: 'Urgent' })

        await program.parseAsync(['node', 'td', 'settings', 'view'])

        expect(mockApi.getLabel).toHaveBeenCalledWith('label-1')
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('label?id=label-1 (Urgent)'),
        )
        consoleSpy.mockRestore()
    })

    it('resolves filter name', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchUserSettings.mockResolvedValue({
            ...defaultSettings,
            startPage: 'filter?id=filter-1',
        })
        mockFetchFilters.mockResolvedValue([
            {
                id: 'filter-1',
                name: 'Work tasks',
                query: '@work',
                isFavorite: false,
                isDeleted: false,
            },
            {
                id: 'filter-2',
                name: 'Personal',
                query: '@personal',
                isFavorite: false,
                isDeleted: false,
            },
        ])

        await program.parseAsync(['node', 'td', 'settings', 'view'])

        expect(mockFetchFilters).toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('filter?id=filter-1 (Work tasks)'),
        )
        consoleSpy.mockRestore()
    })

    it('does not call API for simple start page values', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchUserSettings.mockResolvedValue(defaultSettings) // startPage: 'today'

        await program.parseAsync(['node', 'td', 'settings', 'view'])

        expect(mockGetApi).not.toHaveBeenCalled()
        expect(mockFetchFilters).not.toHaveBeenCalled()
        consoleSpy.mockRestore()
    })

    it('has null startPageName in JSON for simple values', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchUserSettings.mockResolvedValue(defaultSettings) // startPage: 'today'

        await program.parseAsync(['node', 'td', 'settings', 'view', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.startPage).toBe('today')
        expect(parsed.startPageName).toBeNull()
        consoleSpy.mockRestore()
    })

    it('gracefully handles API failure', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchUserSettings.mockResolvedValue({
            ...defaultSettings,
            startPage: 'project?id=abc123',
        })
        mockApi.getProject.mockRejectedValue(new Error('Network error'))

        await program.parseAsync(['node', 'td', 'settings', 'view'])

        // Should show raw value without crashing
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('project?id=abc123'))
        // Should show raw value without resolved name
        const output = consoleSpy.mock.calls[0][0] as string
        expect(output).not.toContain('project?id=abc123 (')
        consoleSpy.mockRestore()
    })
})

describe('settings update', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('updates timezone', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockUpdateUserSettings.mockResolvedValue(undefined)

        await program.parseAsync([
            'node',
            'td',
            'settings',
            'update',
            '--timezone',
            'America/New_York',
        ])

        expect(mockUpdateUserSettings).toHaveBeenCalledWith({
            timezone: 'America/New_York',
        })
        expect(consoleSpy).toHaveBeenCalledWith('Settings updated.')
        consoleSpy.mockRestore()
    })

    it('updates time format to 24h', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockUpdateUserSettings.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'settings', 'update', '--time-format', '24'])

        expect(mockUpdateUserSettings).toHaveBeenCalledWith({ timeFormat: 0 })
        consoleSpy.mockRestore()
    })

    it('updates time format to 12h', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockUpdateUserSettings.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'settings', 'update', '--time-format', '12'])

        expect(mockUpdateUserSettings).toHaveBeenCalledWith({ timeFormat: 1 })
        consoleSpy.mockRestore()
    })

    it('updates date format to US', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockUpdateUserSettings.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'settings', 'update', '--date-format', 'us'])

        expect(mockUpdateUserSettings).toHaveBeenCalledWith({ dateFormat: 1 })
        consoleSpy.mockRestore()
    })

    it('updates date format to international', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockUpdateUserSettings.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'settings', 'update', '--date-format', 'intl'])

        expect(mockUpdateUserSettings).toHaveBeenCalledWith({ dateFormat: 0 })
        consoleSpy.mockRestore()
    })

    it('updates start day with day name', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockUpdateUserSettings.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'settings', 'update', '--start-day', 'Sunday'])

        expect(mockUpdateUserSettings).toHaveBeenCalledWith({ startDay: 7 })
        consoleSpy.mockRestore()
    })

    it('updates start day with short day name', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockUpdateUserSettings.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'settings', 'update', '--start-day', 'Mon'])

        expect(mockUpdateUserSettings).toHaveBeenCalledWith({ startDay: 1 })
        consoleSpy.mockRestore()
    })

    it('updates theme by name', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockUpdateUserSettings.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'settings', 'update', '--theme', 'kale'])

        expect(mockUpdateUserSettings).toHaveBeenCalledWith({ theme: 5 })
        consoleSpy.mockRestore()
    })

    it('updates auto reminder', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockUpdateUserSettings.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'settings', 'update', '--auto-reminder', '60'])

        expect(mockUpdateUserSettings).toHaveBeenCalledWith({ autoReminder: 60 })
        consoleSpy.mockRestore()
    })

    it('updates notification settings', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockUpdateUserSettings.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'settings', 'update', '--reminder-email', 'on'])

        expect(mockUpdateUserSettings).toHaveBeenCalledWith({ reminderEmail: true })
        consoleSpy.mockRestore()
    })

    it('parses boolean values correctly', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockUpdateUserSettings.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'settings', 'update', '--reminder-push', 'off'])

        expect(mockUpdateUserSettings).toHaveBeenCalledWith({ reminderPush: false })
        consoleSpy.mockRestore()
    })

    it('updates multiple settings at once', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockUpdateUserSettings.mockResolvedValue(undefined)

        await program.parseAsync([
            'node',
            'td',
            'settings',
            'update',
            '--timezone',
            'UTC',
            '--time-format',
            '24',
            '--reminder-desktop',
            'on',
        ])

        expect(mockUpdateUserSettings).toHaveBeenCalledWith({
            timezone: 'UTC',
            timeFormat: 0,
            reminderDesktop: true,
        })
        consoleSpy.mockRestore()
    })

    it('shows help when no settings specified', async () => {
        const program = createProgram()
        const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

        try {
            await program.parseAsync(['node', 'td', 'settings', 'update'])
        } catch (err: unknown) {
            // Commander throws when help() is called with exitOverride
            if ((err as { code?: string }).code !== 'commander.help') throw err
        }

        expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Usage:'))
        stdoutSpy.mockRestore()
    })

    it('errors on invalid time format', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'td', 'settings', 'update', '--time-format', '25']),
        ).rejects.toThrow('Allowed choices are')
    })

    it('errors on invalid theme name', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'td', 'settings', 'update', '--theme', 'invalid']),
        ).rejects.toThrow('Allowed choices are')
    })

    it('errors on invalid day name', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'td', 'settings', 'update', '--start-day', 'invalid']),
        ).rejects.toThrow('Allowed choices are')
    })
})

describe('choices-parser alignment', () => {
    it.each(TIME_FORMAT_CHOICES)('parseTimeFormat accepts choice "%s"', (value) => {
        expect(() => parseTimeFormat(value)).not.toThrow()
    })

    it.each(DATE_FORMAT_CHOICES)('parseDateFormat accepts choice "%s"', (value) => {
        expect(() => parseDateFormat(value)).not.toThrow()
    })

    it.each(DAY_CHOICES)('parseDay accepts choice "%s"', (value) => {
        expect(() => parseDay(value)).not.toThrow()
    })

    it.each(THEME_CHOICES)('parseTheme accepts choice "%s"', (value) => {
        expect(() => parseTheme(value)).not.toThrow()
    })
})
