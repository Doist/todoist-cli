import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api/core.js', () => ({
    getApi: vi.fn(),
}))

vi.mock('../lib/stdin.js', () => ({
    readStdin: vi.fn(),
}))

import { readStdin } from '../lib/stdin.js'
import { setupApiMock } from '../test-support/api-mock.js'
import { mockConsoleLog } from '../test-support/console-spy.js'
import { type MockApi } from '../test-support/mock-api.js'
import { createTestProgram } from '../test-support/program.js'
import { registerAddCommand } from './add.js'

const mockReadStdin = vi.mocked(readStdin)

function createProgram() {
    return createTestProgram(registerAddCommand)
}

describe('add command', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('calls quickAddTask with text', async () => {
        const program = createProgram()
        mockConsoleLog()

        mockApi.quickAddTask.mockResolvedValue({
            id: 'task-1',
            content: 'Buy milk',
            due: null,
        })

        await program.parseAsync(['node', 'td', 'add', 'Buy milk'])

        expect(mockApi.quickAddTask).toHaveBeenCalledWith({ text: 'Buy milk' })
    })

    it('displays created task content', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockApi.quickAddTask.mockResolvedValue({
            id: 'task-1',
            content: 'Buy milk tomorrow',
            due: null,
        })

        await program.parseAsync(['node', 'td', 'add', 'Buy milk tomorrow'])

        expect(consoleSpy).toHaveBeenCalledWith('Created: Buy milk tomorrow')
    })

    it('displays due date when present', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockApi.quickAddTask.mockResolvedValue({
            id: 'task-1',
            content: 'Meeting',
            due: { date: '2026-01-10', string: 'tomorrow' },
        })

        await program.parseAsync(['node', 'td', 'add', 'Meeting tomorrow'])

        expect(consoleSpy).toHaveBeenCalledWith('Due: tomorrow')
    })

    it('displays task ID', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockApi.quickAddTask.mockResolvedValue({
            id: 'task-123',
            content: 'Test',
            due: null,
        })

        await program.parseAsync(['node', 'td', 'add', 'Test'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('task-123'))
    })

    it('handles text with natural language and tags', async () => {
        const program = createProgram()
        mockConsoleLog()

        mockApi.quickAddTask.mockResolvedValue({
            id: 'task-1',
            content: 'Buy milk',
            due: { date: '2026-01-10', string: 'tomorrow' },
        })

        await program.parseAsync(['node', 'td', 'add', 'Buy milk tomorrow p1 #Shopping'])

        expect(mockApi.quickAddTask).toHaveBeenCalledWith({
            text: 'Buy milk tomorrow p1 #Shopping',
        })
    })

    it('--dry-run previews without calling API', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        await program.parseAsync(['node', 'td', 'add', 'Buy milk', '--dry-run'])

        expect(mockApi.quickAddTask).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would quick add task'))
    })

    it('reads text from stdin with --stdin', async () => {
        const program = createProgram()
        mockConsoleLog()

        mockReadStdin.mockResolvedValue('Buy milk tomorrow\n')
        mockApi.quickAddTask.mockResolvedValue({
            id: 'task-1',
            content: 'Buy milk',
            due: null,
        })

        await program.parseAsync(['node', 'td', 'add', '--stdin'])

        expect(mockReadStdin).toHaveBeenCalled()
        expect(mockApi.quickAddTask).toHaveBeenCalledWith({ text: 'Buy milk tomorrow' })
    })

    it('errors when both text and --stdin are provided', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'td', 'add', 'Buy milk', '--stdin']),
        ).rejects.toThrow(/Cannot specify text both as argument and --stdin/)
    })

    it('--json outputs JSON of created task', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

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
    })
})
