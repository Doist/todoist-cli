import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api/core.js', () => ({
    getApi: vi.fn(),
}))

import { registerAddCommand } from '../commands/add.js'
import { getApi } from '../lib/api/core.js'

const mockGetApi = vi.mocked(getApi)

function createMockApi() {
    return {
        quickAddTask: vi.fn(),
        getProject: vi.fn(),
        updateTask: vi.fn(),
    }
}

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerAddCommand(program)
    return program
}

describe('add command', () => {
    let mockApi: ReturnType<typeof createMockApi>

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

    it('assigns task with --assignee flag', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.quickAddTask.mockResolvedValue({
            id: 'task-1',
            content: 'Review PR',
            projectId: 'proj-1',
            due: null,
        })
        mockApi.getProject.mockResolvedValue({
            id: 'proj-1',
            name: 'Work',
            isShared: true,
        })
        mockApi.updateTask.mockResolvedValue({
            id: 'task-1',
            content: 'Review PR',
            due: null,
        })

        await program.parseAsync(['node', 'td', 'add', 'Review PR', '--assignee', 'id:user-123'])

        expect(mockApi.updateTask).toHaveBeenCalledWith('task-1', {
            assigneeId: 'user-123',
        })
        consoleSpy.mockRestore()
    })
})
