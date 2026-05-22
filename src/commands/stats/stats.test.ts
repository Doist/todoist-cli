import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/api/stats.js', () => ({
    fetchProductivityStats: vi.fn(),
    updateGoals: vi.fn(),
}))

import { fetchProductivityStats, updateGoals } from '../../lib/api/stats.js'
import { mockConsoleLog, mockProcessStdout } from '../../test-support/console-spy.js'
import { createTestProgram } from '../../test-support/program.js'
import { registerStatsCommand } from './index.js'

const mockFetchProductivityStats = vi.mocked(fetchProductivityStats)
const mockUpdateGoals = vi.mocked(updateGoals)

function createProgram() {
    return createTestProgram(registerStatsCommand)
}

const defaultStats = {
    karma: 12543,
    karmaTrend: 'up',
    karmaLastUpdate: 5,
    completedCount: 4521,
    daysItems: [{ date: new Date().toISOString().slice(0, 10), totalCompleted: 3, items: [] }],
    weekItems: [{ from: '2025-01-06', to: '2025-01-12', totalCompleted: 18, items: [] }],
    karmaGraphData: [],
    karmaUpdateReasons: [],
    projectColors: {},
    goals: {
        dailyGoal: 5,
        weeklyGoal: 25,
        currentDailyStreak: { count: 42, start: '2024-11-30', end: '2025-01-11' },
        currentWeeklyStreak: { count: 8, start: '2024-11-18', end: '2025-01-06' },
        lastDailyStreak: { count: 0, start: '', end: '' },
        lastWeeklyStreak: { count: 0, start: '', end: '' },
        maxDailyStreak: { count: 67, start: '2023-01-01', end: '2023-03-09' },
        maxWeeklyStreak: { count: 12, start: '2022-06-01', end: '2022-08-21' },
        vacationMode: false,
        karmaDisabled: false,
        ignoreDays: [] as never[],
        user: '',
        userId: '1',
    },
}

describe('stats view', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('displays stats in human-readable format', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockFetchProductivityStats.mockResolvedValue(defaultStats)

        await program.parseAsync(['node', 'td', 'stats'])

        expect(mockFetchProductivityStats).toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Karma:'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('12,543'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Daily:'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Weekly:'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Completed:'))
    })

    it('shows vacation mode warning when enabled', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        const vacationStats = {
            ...defaultStats,
            goals: { ...defaultStats.goals, vacationMode: true },
        }
        mockFetchProductivityStats.mockResolvedValue(vacationStats)

        await program.parseAsync(['node', 'td', 'stats'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Vacation mode'))
    })

    it('outputs JSON with --json flag', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockFetchProductivityStats.mockResolvedValue(defaultStats)

        await program.parseAsync(['node', 'td', 'stats', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.karma).toBe(12543)
        expect(parsed.karmaTrend).toBe('up')
        expect(parsed.completedCount).toBe(4521)
        expect(parsed.goals.dailyGoal).toBe(5)
        expect(parsed.goals.currentDailyStreak.count).toBe(42)
    })

    it('outputs full JSON with --json --full flags', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockFetchProductivityStats.mockResolvedValue(defaultStats)

        await program.parseAsync(['node', 'td', 'stats', '--json', '--full'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.karmaLastUpdate).toBe(5)
        expect(parsed.daysItems).toBeDefined()
        expect(parsed.weekItems).toBeDefined()
        expect(parsed.goals.ignoreDays).toBeDefined()
    })

    it('shows streak information', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockFetchProductivityStats.mockResolvedValue(defaultStats)

        await program.parseAsync(['node', 'td', 'stats'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('streak:'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('42'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('best: 67'))
    })
})

describe('stats goals', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('updates daily goal', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockUpdateGoals.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'stats', 'goals', '--daily', '10'])

        expect(mockUpdateGoals).toHaveBeenCalledWith({ dailyGoal: 10 })
        expect(consoleSpy).toHaveBeenCalledWith('Goals updated.')
    })

    it('updates weekly goal', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockUpdateGoals.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'stats', 'goals', '--weekly', '50'])

        expect(mockUpdateGoals).toHaveBeenCalledWith({ weeklyGoal: 50 })
        expect(consoleSpy).toHaveBeenCalledWith('Goals updated.')
    })

    it('updates both daily and weekly goals', async () => {
        const program = createProgram()
        mockConsoleLog()

        mockUpdateGoals.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'stats', 'goals', '--daily', '5', '--weekly', '25'])

        expect(mockUpdateGoals).toHaveBeenCalledWith({
            dailyGoal: 5,
            weeklyGoal: 25,
        })
    })

    it('shows help when no options specified', async () => {
        const program = createProgram()
        const stdoutSpy = mockProcessStdout()

        try {
            await program.parseAsync(['node', 'td', 'stats', 'goals'])
        } catch (err: unknown) {
            if ((err as { code?: string }).code !== 'commander.help') throw err
        }

        expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Usage:'))
    })

    it('errors on invalid daily goal', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'td', 'stats', 'goals', '--daily', 'abc']),
        ).rejects.toThrow('non-negative number')
    })

    it('errors on negative daily goal', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'td', 'stats', 'goals', '--daily', '-5']),
        ).rejects.toThrow('non-negative number')
    })
})

describe('stats vacation', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('enables vacation mode with --on', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockUpdateGoals.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'stats', 'vacation', '--on'])

        expect(mockUpdateGoals).toHaveBeenCalledWith({ vacationMode: true })
        expect(consoleSpy).toHaveBeenCalledWith('Vacation mode enabled.')
    })

    it('disables vacation mode with --off', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockUpdateGoals.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'stats', 'vacation', '--off'])

        expect(mockUpdateGoals).toHaveBeenCalledWith({ vacationMode: false })
        expect(consoleSpy).toHaveBeenCalledWith('Vacation mode disabled.')
    })

    it('errors when both --on and --off specified', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'td', 'stats', 'vacation', '--on', '--off']),
        ).rejects.toThrow('Cannot use both')
    })

    it('shows help when no options specified', async () => {
        const program = createProgram()
        const stdoutSpy = mockProcessStdout()

        try {
            await program.parseAsync(['node', 'td', 'stats', 'vacation'])
        } catch (err: unknown) {
            if ((err as { code?: string }).code !== 'commander.help') throw err
        }

        expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Usage:'))
    })
})
