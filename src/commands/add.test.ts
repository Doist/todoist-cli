import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api/core.js', () => ({
    getApi: vi.fn(),
}))

vi.mock('../lib/stdin.js', () => ({
    readStdin: vi.fn(),
}))

import { getApi } from '../lib/api/core.js'
import { readStdin } from '../lib/stdin.js'
import { createMockApi, type MockApi } from '../test-support/mock-api.js'
import { registerAddCommand } from './add.js'

const mockGetApi = vi.mocked(getApi)
const mockReadStdin = vi.mocked(readStdin)

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerAddCommand(program)
    return program
}

describe('add command', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('calls quickAddTask with text', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.quickAddTask.mockResolvedValue({
            id: 'task-1',
            content: 'Buy milk',
            due: null,
        })

        await program.parseAsync(['node', 'td', 'add', 'Buy milk'])

        expect(mockApi.quickAddTask).toHaveBeenCalledWith({ text: 'Buy milk' })
        consoleSpy.mockRestore()
    })

    it('displays created task content', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.quickAddTask.mockResolvedValue({
            id: 'task-1',
            content: 'Buy milk tomorrow',
            due: null,
        })

        await program.parseAsync(['node', 'td', 'add', 'Buy milk tomorrow'])

        expect(consoleSpy).toHaveBeenCalledWith('Created: Buy milk tomorrow')
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

        await program.parseAsync(['node', 'td', 'add', 'Meeting tomorrow'])

        expect(consoleSpy).toHaveBeenCalledWith('Due: tomorrow')
        consoleSpy.mockRestore()
    })

    it('displays task ID', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.quickAddTask.mockResolvedValue({
            id: 'task-123',
            content: 'Test',
            due: null,
        })

        await program.parseAsync(['node', 'td', 'add', 'Test'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('task-123'))
        consoleSpy.mockRestore()
    })

    it('handles text with natural language and tags', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.quickAddTask.mockResolvedValue({
            id: 'task-1',
            content: 'Buy milk',
            due: { date: '2026-01-10', string: 'tomorrow' },
        })

        await program.parseAsync(['node', 'td', 'add', 'Buy milk tomorrow p1 #Shopping'])

        expect(mockApi.quickAddTask).toHaveBeenCalledWith({
            text: 'Buy milk tomorrow p1 #Shopping',
        })
        consoleSpy.mockRestore()
    })

    it('--dry-run previews without calling API', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'td', 'add', 'Buy milk', '--dry-run'])

        expect(mockApi.quickAddTask).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would quick add task'))
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

        await program.parseAsync(['node', 'td', 'add', '--stdin'])

        expect(mockReadStdin).toHaveBeenCalled()
        expect(mockApi.quickAddTask).toHaveBeenCalledWith({ text: 'Buy milk tomorrow' })
        consoleSpy.mockRestore()
    })

    it('errors when both text and --stdin are provided', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'td', 'add', 'Buy milk', '--stdin']),
        ).rejects.toThrow(/Cannot specify text both as argument and --stdin/)
    })

    it('--json outputs JSON of created task', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.quickAddTask.mockResolvedValue({
            id: 'task-1',
            content: 'Buy milk',
            due: null,
        })

        await program.parseAsync(['node', 'td', 'add', 'Buy milk', '--json'])

        expect(mockApi.quickAddTask).toHaveBeenCalled()
        const output = consoleSpy.mock.calls[0][0] as string
        expect(() => JSON.parse(output)).not.toThrow()
        expect(JSON.parse(output)).toMatchObject({ id: 'task-1', content: 'Buy milk' })
        consoleSpy.mockRestore()
    })
})
