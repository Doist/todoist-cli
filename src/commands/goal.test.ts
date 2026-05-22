import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api/core.js', () => ({
    getApi: vi.fn(),
}))

import { setupApiMock } from '../test-support/api-mock.js'
import { fixtures } from '../test-support/fixtures.js'
import { type MockApi } from '../test-support/mock-api.js'
import { createTestProgram } from '../test-support/program.js'
import { registerGoalCommand } from './goal.js'

function createProgram() {
    return createTestProgram(registerGoalCommand)
}

describe('goal list', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
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
        mockApi = setupApiMock()
    })

    it('shows goal details and linked tasks', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getGoal.mockResolvedValue(fixtures.goals.shipV2)
        mockApi.getTasks.mockResolvedValue({
            results: [fixtures.tasks.basic],
            nextCursor: null,
        })
        mockApi.getProjects.mockResolvedValue({
            results: [fixtures.projects.work],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'goal', 'view', `id:${fixtures.goals.shipV2.id}`])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Ship v2'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('2026-04-03'))
        const rendered = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n')
        expect(rendered).toContain('Buy milk')
        expect(rendered).not.toContain('[object Promise]')
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
        mockApi = setupApiMock()
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

describe('goal update', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('updates name', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getGoal.mockResolvedValue(fixtures.goals.shipV2)
        mockApi.updateGoal.mockResolvedValue({ ...fixtures.goals.shipV2, name: 'Ship v3' })

        await program.parseAsync([
            'node',
            'td',
            'goal',
            'update',
            `id:${fixtures.goals.shipV2.id}`,
            '--name',
            'Ship v3',
        ])

        expect(mockApi.updateGoal).toHaveBeenCalledWith(
            fixtures.goals.shipV2.id,
            expect.objectContaining({ name: 'Ship v3' }),
        )
        expect(consoleSpy).toHaveBeenCalledWith('Updated: Ship v2 → Ship v3')
        consoleSpy.mockRestore()
    })

    it('clears description with empty string', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getGoal.mockResolvedValue(fixtures.goals.shipV2)
        mockApi.updateGoal.mockResolvedValue({ ...fixtures.goals.shipV2, description: '' })

        await program.parseAsync([
            'node',
            'td',
            'goal',
            'update',
            `id:${fixtures.goals.shipV2.id}`,
            '--description',
            '',
        ])

        expect(mockApi.updateGoal).toHaveBeenCalledWith(fixtures.goals.shipV2.id, {
            description: '',
        })
        consoleSpy.mockRestore()
    })

    it('throws CliError when no update fields specified', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'td', 'goal', 'update', `id:${fixtures.goals.shipV2.id}`]),
        ).rejects.toMatchObject({
            code: 'INVALID_ARGUMENT',
            message: expect.stringContaining('No update fields specified'),
        })
        expect(mockApi.updateGoal).not.toHaveBeenCalled()
    })

    it('--dry-run previews without calling API', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync([
            'node',
            'td',
            'goal',
            'update',
            `id:${fixtures.goals.shipV2.id}`,
            '--name',
            'Ship v3',
            '--dry-run',
        ])

        expect(mockApi.updateGoal).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would update goal'))
        consoleSpy.mockRestore()
    })

    it('outputs JSON with --json', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getGoal.mockResolvedValue(fixtures.goals.shipV2)
        mockApi.updateGoal.mockResolvedValue({ ...fixtures.goals.shipV2, name: 'Ship v3' })

        await program.parseAsync([
            'node',
            'td',
            'goal',
            'update',
            `id:${fixtures.goals.shipV2.id}`,
            '--name',
            'Ship v3',
            '--json',
        ])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.name).toBe('Ship v3')
        consoleSpy.mockRestore()
    })
})

describe('goal delete', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
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
        mockApi = setupApiMock()
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
