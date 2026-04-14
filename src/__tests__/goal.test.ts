import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api/core.js', () => ({
    getApi: vi.fn(),
}))

vi.mock('../lib/api/goal-tasks.js', () => ({
    fetchCompletedTasksForGoal: vi.fn(),
}))

import { registerGoalCommand } from '../commands/goal.js'
import { getApi } from '../lib/api/core.js'
import { fetchCompletedTasksForGoal } from '../lib/api/goal-tasks.js'
import { fixtures } from './helpers/fixtures.js'
import { createMockApi, type MockApi } from './helpers/mock-api.js'

const mockGetApi = vi.mocked(getApi)
const mockFetchCompleted = vi.mocked(fetchCompletedTasksForGoal)

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerGoalCommand(program)
    return program
}

describe('goal list', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('shows "No goals found" when empty', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'td', 'goal', 'list'])

        expect(consoleSpy).toHaveBeenCalledWith('No goals found.')
        consoleSpy.mockRestore()
    })

    it('lists goals with progress', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getGoals.mockResolvedValue({
            results: [fixtures.goals.shipV2, fixtures.goals.learnRust],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'goal', 'list'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Ship v2'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Learn Rust'))
        consoleSpy.mockRestore()
    })

    it('outputs JSON with --json flag', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getGoals.mockResolvedValue({
            results: [fixtures.goals.shipV2],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'goal', 'list', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.results).toBeDefined()
        expect(parsed.results[0].name).toBe('Ship v2')
        consoleSpy.mockRestore()
    })
})

describe('goal view', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('shows goal details and linked tasks', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getGoal.mockResolvedValue(fixtures.goals.shipV2)
        mockApi.getTasks.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'goal', 'view', `id:${fixtures.goals.shipV2.id}`])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Ship v2'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('2026-04-03'))
        consoleSpy.mockRestore()
    })

    it('includes description in JSON output', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getGoal.mockResolvedValue(fixtures.goals.shipV2)
        mockApi.getTasks.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync([
            'node',
            'td',
            'goal',
            'view',
            `id:${fixtures.goals.shipV2.id}`,
            '--json',
        ])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.goal.description).toBe('Launch the new version')
        consoleSpy.mockRestore()
    })

    it('does not fetch completed tasks unless --include-completed is set', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getGoal.mockResolvedValue(fixtures.goals.shipV2)
        mockApi.getTasks.mockResolvedValue({ results: [fixtures.tasks.basic], nextCursor: null })

        await program.parseAsync([
            'node',
            'td',
            'goal',
            'view',
            `id:${fixtures.goals.shipV2.id}`,
            '--all',
            '--json',
        ])

        expect(mockFetchCompleted).not.toHaveBeenCalled()
        const parsed = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(parsed.tasks.results).toHaveLength(1)
        expect(parsed.completedTaskCount).toBeUndefined()
        consoleSpy.mockRestore()
    })

    it('merges completed tasks when --include-completed is set', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getGoal.mockResolvedValue(fixtures.goals.shipV2)
        mockApi.getTasks.mockResolvedValue({ results: [fixtures.tasks.basic], nextCursor: null })
        mockFetchCompleted.mockResolvedValue({
            tasks: [fixtures.tasks.completed, fixtures.tasks.completed],
            truncated: false,
        })

        await program.parseAsync([
            'node',
            'td',
            'goal',
            'view',
            `id:${fixtures.goals.shipV2.id}`,
            '--all',
            '--include-completed',
            '--json',
        ])

        expect(mockFetchCompleted).toHaveBeenCalledWith(
            expect.objectContaining({
                goalId: fixtures.goals.shipV2.id,
                expectedCount: 2,
            }),
        )
        const parsed = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(parsed.tasks.results).toHaveLength(3)
        expect(parsed.completedTaskCount).toBe(2)
        expect(parsed.completedTasksTruncated).toBe(false)
        consoleSpy.mockRestore()
    })

    it('caps merged results at --limit when --include-completed is set', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getGoal.mockResolvedValue(fixtures.goals.shipV2)
        mockApi.getTasks.mockResolvedValue({
            results: [fixtures.tasks.basic, fixtures.tasks.withDue],
            nextCursor: null,
        })
        mockFetchCompleted.mockResolvedValue({
            tasks: [fixtures.tasks.completed],
            truncated: false,
        })

        await program.parseAsync([
            'node',
            'td',
            'goal',
            'view',
            `id:${fixtures.goals.shipV2.id}`,
            '--limit',
            '3',
            '--include-completed',
            '--json',
        ])

        expect(mockFetchCompleted).toHaveBeenCalledWith(expect.objectContaining({ limit: 1 }))
        consoleSpy.mockRestore()
    })

    it('flags truncation in JSON output when completed history overflows window', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getGoal.mockResolvedValue(fixtures.goals.shipV2)
        mockApi.getTasks.mockResolvedValue({ results: [], nextCursor: null })
        mockFetchCompleted.mockResolvedValue({
            tasks: [fixtures.tasks.completed],
            truncated: true,
        })

        await program.parseAsync([
            'node',
            'td',
            'goal',
            'view',
            `id:${fixtures.goals.shipV2.id}`,
            '--all',
            '--include-completed',
            '--json',
        ])

        const parsed = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(parsed.completedTasksTruncated).toBe(true)
        consoleSpy.mockRestore()
    })

    it('is the default subcommand', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getGoal.mockResolvedValue(fixtures.goals.shipV2)
        mockApi.getTasks.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'goal', `id:${fixtures.goals.shipV2.id}`])

        expect(mockApi.getGoal).toHaveBeenCalled()
        consoleSpy.mockRestore()
    })
})

describe('goal create', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('creates a goal', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.addGoal.mockResolvedValue(fixtures.goals.shipV2)

        await program.parseAsync(['node', 'td', 'goal', 'create', '--name', 'Ship v2'])

        expect(mockApi.addGoal).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ship v2' }))
        expect(consoleSpy).toHaveBeenCalledWith('Created: Ship v2')
        consoleSpy.mockRestore()
    })

    it('outputs JSON with --json', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.addGoal.mockResolvedValue(fixtures.goals.shipV2)

        await program.parseAsync(['node', 'td', 'goal', 'create', '--name', 'Ship v2', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.name).toBe('Ship v2')
        consoleSpy.mockRestore()
    })

    it('--dry-run previews without calling API', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'td', 'goal', 'create', '--name', 'Ship v2', '--dry-run'])

        expect(mockApi.addGoal).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would create goal'))
        consoleSpy.mockRestore()
    })
})

describe('goal delete', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('shows dry-run without --yes', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getGoal.mockResolvedValue(fixtures.goals.shipV2)

        await program.parseAsync(['node', 'td', 'goal', 'delete', `id:${fixtures.goals.shipV2.id}`])

        expect(mockApi.deleteGoal).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith('Would delete goal: Ship v2')
        consoleSpy.mockRestore()
    })

    it('deletes with --yes', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getGoal.mockResolvedValue(fixtures.goals.shipV2)
        mockApi.deleteGoal.mockResolvedValue(true)

        await program.parseAsync([
            'node',
            'td',
            'goal',
            'delete',
            `id:${fixtures.goals.shipV2.id}`,
            '--yes',
        ])

        expect(mockApi.deleteGoal).toHaveBeenCalledWith(fixtures.goals.shipV2.id)
        consoleSpy.mockRestore()
    })
})

describe('goal complete/uncomplete', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('completes a goal', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getGoal.mockResolvedValue(fixtures.goals.shipV2)
        mockApi.completeGoal.mockResolvedValue({ ...fixtures.goals.shipV2, isCompleted: true })

        await program.parseAsync([
            'node',
            'td',
            'goal',
            'complete',
            `id:${fixtures.goals.shipV2.id}`,
        ])

        expect(mockApi.completeGoal).toHaveBeenCalledWith(fixtures.goals.shipV2.id)
        expect(consoleSpy).toHaveBeenCalledWith('Completed: Ship v2')
        consoleSpy.mockRestore()
    })

    it('uncompletes a goal', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getGoal.mockResolvedValue(fixtures.goals.learnRust)
        mockApi.uncompleteGoal.mockResolvedValue({
            ...fixtures.goals.learnRust,
            isCompleted: false,
        })

        await program.parseAsync([
            'node',
            'td',
            'goal',
            'uncomplete',
            `id:${fixtures.goals.learnRust.id}`,
        ])

        expect(mockApi.uncompleteGoal).toHaveBeenCalledWith(fixtures.goals.learnRust.id)
        expect(consoleSpy).toHaveBeenCalledWith('Reopened: Learn Rust')
        consoleSpy.mockRestore()
    })
})
