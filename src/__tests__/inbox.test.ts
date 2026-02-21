import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api/core.js', () => ({
    getApi: vi.fn(),
    isWorkspaceProject: vi.fn().mockReturnValue(false),
}))

import { registerInboxCommand } from '../commands/inbox.js'
import { getApi } from '../lib/api/core.js'
import { createMockApi, type MockApi } from './helpers/mock-api.js'

const mockGetApi = vi.mocked(getApi)

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerInboxCommand(program)
    return program
}

describe('inbox command', () => {
    let mockApi: MockApi
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
        consoleSpy.mockRestore()
    })

    it('fetches user to get inboxProjectId', async () => {
        const program = createProgram()

        mockApi.getUser.mockResolvedValue({
            id: 'user-1',
            inboxProjectId: 'inbox-proj',
        })
        mockApi.getProject.mockResolvedValue({ id: 'inbox-proj', name: 'Inbox' })

        await program.parseAsync(['node', 'td', 'inbox'])

        expect(mockApi.getUser).toHaveBeenCalled()
    })

    it('lists tasks for inbox project', async () => {
        const program = createProgram()

        mockApi.getUser.mockResolvedValue({
            id: 'user-1',
            inboxProjectId: 'inbox-proj',
        })
        mockApi.getProject.mockResolvedValue({ id: 'inbox-proj', name: 'Inbox' })
        mockApi.getTasks.mockResolvedValue({
            results: [{ id: 'task-1', content: 'Inbox task', projectId: 'inbox-proj' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'inbox'])

        expect(mockApi.getTasks).toHaveBeenCalledWith(
            expect.objectContaining({ projectId: 'inbox-proj' }),
        )
    })

    it('outputs JSON when --json flag', async () => {
        const program = createProgram()

        mockApi.getUser.mockResolvedValue({
            id: 'user-1',
            inboxProjectId: 'inbox-proj',
        })
        mockApi.getTasks.mockResolvedValue({
            results: [{ id: 'task-1', content: 'Test', projectId: 'inbox-proj' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'inbox', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.results).toBeDefined()
    })

    it('passes priority filter through', async () => {
        const program = createProgram()

        mockApi.getUser.mockResolvedValue({
            id: 'user-1',
            inboxProjectId: 'inbox-proj',
        })
        mockApi.getProject.mockResolvedValue({ id: 'inbox-proj', name: 'Inbox' })
        mockApi.getTasksByFilter.mockResolvedValue({
            results: [{ id: 'task-1', content: 'High', priority: 4, projectId: 'inbox-proj' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'inbox', '--priority', 'p1'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('High'))
        expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Low'))
        expect(mockApi.getTasksByFilter).toHaveBeenCalledWith(
            expect.objectContaining({
                query: 'p1',
            }),
        )
    })
})
