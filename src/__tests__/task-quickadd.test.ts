import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api/core.js', () => ({
    getApi: vi.fn(),
    completeTaskForever: vi.fn(),
    rescheduleTask: vi.fn(),
}))

vi.mock('../lib/stdin.js', () => ({
    readStdin: vi.fn(),
}))

import { registerTaskCommand } from '../commands/task/index.js'
import { getApi } from '../lib/api/core.js'
import { resetGlobalArgs } from '../lib/global-args.js'
import { readStdin } from '../lib/stdin.js'
import { createMockApi, type MockApi } from './helpers/mock-api.js'

const mockGetApi = vi.mocked(getApi)
const mockReadStdin = vi.mocked(readStdin)

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerTaskCommand(program)
    return program
}

describe('task quickadd command', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        resetGlobalArgs()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('calls quickAddTask with positional text', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.quickAddTask.mockResolvedValue({
            id: 'task-1',
            content: 'Buy milk',
            due: null,
        })

        await program.parseAsync(['node', 'td', 'task', 'quickadd', 'Buy milk tomorrow p1'])

        expect(mockApi.quickAddTask).toHaveBeenCalledWith({ text: 'Buy milk tomorrow p1' })
        consoleSpy.mockRestore()
    })

    it('works via qa alias', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.quickAddTask.mockResolvedValue({
            id: 'task-1',
            content: 'Buy milk',
            due: null,
        })

        await program.parseAsync(['node', 'td', 'task', 'qa', 'Buy milk'])

        expect(mockApi.quickAddTask).toHaveBeenCalledWith({ text: 'Buy milk' })
        consoleSpy.mockRestore()
    })

    it('reads text from stdin with --stdin', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockReadStdin.mockResolvedValue('Buy milk tomorrow\n')
        mockApi.quickAddTask.mockResolvedValue({
            id: 'task-1',
            content: 'Buy milk',
            due: null,
        })

        await program.parseAsync(['node', 'td', 'task', 'qa', '--stdin'])

        expect(mockReadStdin).toHaveBeenCalled()
        expect(mockApi.quickAddTask).toHaveBeenCalledWith({ text: 'Buy milk tomorrow' })
        consoleSpy.mockRestore()
    })

    it('errors when both text and --stdin are provided', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'td', 'task', 'qa', 'Buy milk', '--stdin']),
        ).rejects.toThrow(/Cannot specify text both as argument and --stdin/)
    })

    it('--dry-run skips API call and prints preview', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'td', 'task', 'qa', 'Buy milk', '--dry-run'])

        expect(mockApi.quickAddTask).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would quick add task'))
        consoleSpy.mockRestore()
    })

    it('--json outputs task as JSON', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.quickAddTask.mockResolvedValue({
            id: 'task-1',
            content: 'Buy milk',
            due: null,
        })

        await program.parseAsync(['node', 'td', 'task', 'qa', 'Buy milk', '--json'])

        const output = consoleSpy.mock.calls[0][0] as string
        expect(() => JSON.parse(output)).not.toThrow()
        expect(JSON.parse(output)).toMatchObject({ id: 'task-1', content: 'Buy milk' })
        consoleSpy.mockRestore()
    })

    it('displays due date when present', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.quickAddTask.mockResolvedValue({
            id: 'task-1',
            content: 'Meeting',
            due: { date: '2026-01-10', string: 'tomorrow' },
        })

        await program.parseAsync(['node', 'td', 'task', 'qa', 'Meeting tomorrow'])

        expect(consoleSpy).toHaveBeenCalledWith('Due: tomorrow')
        consoleSpy.mockRestore()
    })
})
