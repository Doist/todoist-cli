import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api/core.js', () => ({
    getApi: vi.fn(),
}))

vi.mock('../lib/api/workspaces.js', () => ({
    fetchWorkspaces: vi.fn().mockResolvedValue([]),
    fetchWorkspaceFolders: vi.fn().mockResolvedValue([]),
}))

vi.mock('../lib/browser.js', () => ({
    openInBrowser: vi.fn(),
}))

import { registerProjectCommand } from '../commands/project/index.js'
import { getApi } from '../lib/api/core.js'
import { fetchWorkspaceFolders, fetchWorkspaces, type Workspace } from '../lib/api/workspaces.js'
import { openInBrowser } from '../lib/browser.js'
import { createMockApi, type MockApi } from './helpers/mock-api.js'

const mockOpenInBrowser = vi.mocked(openInBrowser)

const mockFetchWorkspaces = vi.mocked(fetchWorkspaces)
const mockFetchWorkspaceFolders = vi.mocked(fetchWorkspaceFolders)

const mockGetApi = vi.mocked(getApi)

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerProjectCommand(program)
    return program
}

describe('project list', () => {
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

    it('lists all projects', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [
                { id: 'proj-1', name: 'Work', isFavorite: false },
                { id: 'proj-2', name: 'Personal', isFavorite: false },
            ],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'project', 'list'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Work'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Personal'))
    })

    it('outputs JSON with --json flag', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work', isFavorite: true }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'project', 'list', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.results).toBeDefined()
        expect(parsed.results[0].name).toBe('Work')
    })

    it('outputs NDJSON with --ndjson flag', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [
                { id: 'proj-1', name: 'Work' },
                { id: 'proj-2', name: 'Personal' },
            ],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'project', 'list', '--ndjson'])

        const output = consoleSpy.mock.calls[0][0]
        const lines = output.split('\n')
        expect(lines).toHaveLength(2)
    })

    it('shows cursor footer when more results exist', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: 'cursor-123',
        })

        await program.parseAsync(['node', 'td', 'project', 'list'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('more items exist'))
    })

    it('searches projects by name with --search', async () => {
        const program = createProgram()

        mockApi.searchProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Roadmap', isFavorite: false }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'project', 'list', '--search', 'Road'])

        expect(mockApi.searchProjects).toHaveBeenCalledWith(
            expect.objectContaining({ query: 'Road' }),
        )
        expect(mockApi.getProjects).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Roadmap'))
    })

    it('uses getProjects when no --search provided', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work', isFavorite: false }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'project', 'list'])

        expect(mockApi.getProjects).toHaveBeenCalled()
        expect(mockApi.searchProjects).not.toHaveBeenCalled()
    })

    it('shows empty message when search returns no results', async () => {
        const program = createProgram()

        mockApi.searchProjects.mockResolvedValue({
            results: [],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'project', 'list', '--search', 'nonexistent'])

        expect(consoleSpy).toHaveBeenCalledWith('No matching projects.')
    })

    it('outputs JSON with --search and --json', async () => {
        const program = createProgram()

        mockApi.searchProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Roadmap', isFavorite: false }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'project', 'list', '--search', 'Road', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.results[0].name).toBe('Roadmap')
    })
})

describe('project archived', () => {
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

    it('lists archived projects', async () => {
        const program = createProgram()

        mockApi.getArchivedProjects.mockResolvedValue({
            results: [
                { id: 'proj-1', name: 'Old Project', isFavorite: false },
                { id: 'proj-2', name: 'Done Project', isFavorite: false },
            ],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'project', 'archived'])

        expect(mockApi.getArchivedProjects).toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Old Project'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Done Project'))
    })

    it('shows empty message when no archived projects', async () => {
        const program = createProgram()

        mockApi.getArchivedProjects.mockResolvedValue({
            results: [],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'project', 'archived'])

        expect(consoleSpy).toHaveBeenCalledWith('No archived projects.')
    })

    it('outputs JSON with --json flag', async () => {
        const program = createProgram()

        mockApi.getArchivedProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Old Project', isFavorite: false }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'project', 'archived', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.results).toBeDefined()
        expect(parsed.results[0].name).toBe('Old Project')
    })

    it('outputs NDJSON with --ndjson flag', async () => {
        const program = createProgram()

        mockApi.getArchivedProjects.mockResolvedValue({
            results: [
                { id: 'proj-1', name: 'Old Project' },
                { id: 'proj-2', name: 'Done Project' },
            ],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'project', 'archived', '--ndjson'])

        const output = consoleSpy.mock.calls[0][0]
        const lines = output.split('\n')
        expect(lines).toHaveLength(2)
    })
})

describe('project view', () => {
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

    it('resolves project by name', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [
                {
                    id: 'proj-1',
                    name: 'Work',
                    color: 'blue',
                    isFavorite: true,
                    url: 'https://...',
                },
            ],
            nextCursor: null,
        })
        mockApi.getTasks.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'project', 'view', 'Work'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Work'))
    })

    it('resolves project by id: prefix', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({
            id: 'proj-1',
            name: 'Work',
            color: 'blue',
            isFavorite: false,
            url: 'https://...',
        })
        mockApi.getTasks.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'project', 'view', 'id:proj-1'])

        expect(mockApi.getProject).toHaveBeenCalledWith('proj-1')
    })

    it('implicit view: td project <ref> behaves like td project view <ref>', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({
            id: 'proj-1',
            name: 'Work',
            color: 'blue',
            isFavorite: false,
            url: 'https://...',
        })
        mockApi.getTasks.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'project', 'id:proj-1'])

        expect(mockApi.getProject).toHaveBeenCalledWith('proj-1')
    })

    it('shows project details', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({
            id: 'proj-1',
            name: 'Work',
            color: 'blue',
            isFavorite: true,
            url: 'https://todoist.com/app/project/proj-1',
        })
        mockApi.getTasks.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'project', 'view', 'id:proj-1'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('ID:'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Color:'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Favorite:'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('URL:'))
    })

    it('lists tasks in project', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({
            id: 'proj-1',
            name: 'Work',
            color: 'blue',
            isFavorite: false,
            url: 'https://...',
        })
        mockApi.getTasks.mockResolvedValue({
            results: [
                { id: 'task-1', content: 'Task A', priority: 4 },
                { id: 'task-2', content: 'Task B', priority: 1 },
            ],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'project', 'view', 'id:proj-1'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Tasks (2)'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Task A'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Task B'))
    })

    it('throws for non-existent project', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({ results: [], nextCursor: null })

        await expect(
            program.parseAsync(['node', 'td', 'project', 'view', 'nonexistent']),
        ).rejects.toThrow('not found')
    })

    it('shows workspace info for workspace project', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({
            id: 'proj-1',
            name: 'Work Project',
            color: 'blue',
            isFavorite: false,
            url: 'https://...',
            workspaceId: 'ws-1',
            folderId: 'folder-1',
        })
        mockApi.getTasks.mockResolvedValue({ results: [], nextCursor: null })
        mockFetchWorkspaces.mockResolvedValue([
            { id: 'ws-1', name: 'Acme Corp' } as Partial<Workspace>,
        ] as Workspace[])
        mockFetchWorkspaceFolders.mockResolvedValue([
            { id: 'folder-1', name: 'Engineering', workspaceId: 'ws-1' },
        ])

        await program.parseAsync(['node', 'td', 'project', 'view', 'id:proj-1'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Workspace:'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Acme Corp'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Folder:'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Engineering'))
    })

    it('outputs JSON with --json flag', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({
            id: 'proj-1',
            name: 'Work',
            color: 'blue',
            isFavorite: true,
            url: 'https://...',
        })

        await program.parseAsync(['node', 'td', 'project', 'view', 'id:proj-1', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.id).toBe('proj-1')
        expect(parsed.name).toBe('Work')
    })

    it('outputs full JSON with --json --full', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({
            id: 'proj-1',
            name: 'Work',
            color: 'blue',
            isFavorite: true,
            isShared: false,
            url: 'https://...',
        })

        await program.parseAsync(['node', 'td', 'project', 'view', 'id:proj-1', '--json', '--full'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.id).toBe('proj-1')
        expect(parsed.color).toBe('blue')
    })

    it('shows shared status for shared personal project', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({
            id: 'proj-1',
            name: 'Shared Project',
            color: 'blue',
            isFavorite: false,
            url: 'https://...',
            isShared: true,
        })
        mockApi.getTasks.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'project', 'view', 'id:proj-1'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Shared:'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Yes'))
    })
})

describe('project list grouping', () => {
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

    it('groups projects by workspace', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [
                {
                    id: 'proj-1',
                    name: 'Work Project',
                    isFavorite: false,
                    workspaceId: 'ws-1',
                },
                { id: 'proj-2', name: 'Personal', isFavorite: false },
            ],
            nextCursor: null,
        })
        mockFetchWorkspaces.mockResolvedValue([
            { id: 'ws-1', name: 'Acme Corp' } as Partial<Workspace>,
        ] as Workspace[])

        await program.parseAsync(['node', 'td', 'project', 'list'])

        const calls = consoleSpy.mock.calls.map((c: unknown[]) => c[0] as string)
        expect(calls.some((c: string) => c.includes('Acme Corp'))).toBe(true)
        expect(calls.some((c: string) => c.includes('Personal'))).toBe(true)
    })

    it('shows [shared] marker for shared personal projects', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [
                {
                    id: 'proj-1',
                    name: 'Shared Project',
                    isFavorite: false,
                    isShared: true,
                },
                {
                    id: 'proj-2',
                    name: 'Private Project',
                    isFavorite: false,
                    isShared: false,
                },
            ],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'project', 'list'])

        const calls = consoleSpy.mock.calls.map((c: unknown[]) => c[0] as string)
        expect(
            calls.some((c: string) => c.includes('Shared Project') && c.includes('[shared]')),
        ).toBe(true)
        expect(
            calls.some((c: string) => c.includes('Private Project') && !c.includes('[shared]')),
        ).toBe(true)
    })

    it('lists personal projects before workspace projects', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [
                {
                    id: 'proj-1',
                    name: 'Work Project',
                    isFavorite: false,
                    workspaceId: 'ws-1',
                },
                { id: 'proj-2', name: 'My Personal', isFavorite: false },
            ],
            nextCursor: null,
        })
        mockFetchWorkspaces.mockResolvedValue([
            { id: 'ws-1', name: 'Acme Corp' } as Partial<Workspace>,
        ] as Workspace[])

        await program.parseAsync(['node', 'td', 'project', 'list'])

        const calls = consoleSpy.mock.calls.map((c: unknown[]) => c[0] as string)
        const personalIndex = calls.findIndex((c: string) => c.includes('Personal'))
        const workspaceIndex = calls.findIndex((c: string) => c.includes('Acme Corp'))
        expect(personalIndex).toBeLessThan(workspaceIndex)
    })

    it('sorts workspaces alphabetically by name', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [
                {
                    id: 'proj-1',
                    name: 'Zebra Project',
                    isFavorite: false,
                    workspaceId: 'ws-z',
                },
                {
                    id: 'proj-2',
                    name: 'Alpha Project',
                    isFavorite: false,
                    workspaceId: 'ws-a',
                },
            ],
            nextCursor: null,
        })
        mockFetchWorkspaces.mockResolvedValue([
            { id: 'ws-z', name: 'Zebra Corp' } as Partial<Workspace>,
            { id: 'ws-a', name: 'Alpha Inc' } as Partial<Workspace>,
        ] as Workspace[])

        await program.parseAsync(['node', 'td', 'project', 'list'])

        const calls = consoleSpy.mock.calls.map((c: unknown[]) => c[0] as string)
        const alphaIndex = calls.findIndex((c: string) => c.includes('Alpha Inc'))
        const zebraIndex = calls.findIndex((c: string) => c.includes('Zebra Corp'))
        expect(alphaIndex).toBeLessThan(zebraIndex)
    })

    it('filters by --personal to show only personal projects', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [
                { id: 'proj-1', name: 'Personal Project', isFavorite: false },
                {
                    id: 'proj-2',
                    name: 'Workspace Project',
                    isFavorite: false,
                    workspaceId: 'ws-1',
                },
            ],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'project', 'list', '--personal'])

        const calls = consoleSpy.mock.calls.map((c: unknown[]) => c[0] as string)
        expect(calls.some((c: string) => c.includes('Personal Project'))).toBe(true)
        expect(calls.some((c: string) => c.includes('Workspace Project'))).toBe(false)
    })
})

describe('project collaborators', () => {
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

    it('lists workspace users for workspace project', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({
            id: 'proj-1',
            name: 'Work Project',
            workspaceId: '123',
        })
        mockApi.getWorkspaceUsers.mockResolvedValue({
            workspaceUsers: [
                {
                    userId: 'user-1',
                    fullName: 'John Doe',
                    userEmail: 'john@example.com',
                    role: 'MEMBER',
                },
            ],
            hasMore: false,
        })

        await program.parseAsync(['node', 'td', 'project', 'collaborators', 'id:proj-1'])

        expect(mockApi.getWorkspaceUsers).toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('John D.'))
    })

    it('lists collaborators for shared personal project', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({
            id: 'proj-1',
            name: 'Shared Project',
            isShared: true,
        })
        mockApi.getProjectCollaborators.mockResolvedValue({
            results: [{ id: 'user-1', name: 'Jane Smith', email: 'jane@example.com' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'project', 'collaborators', 'id:proj-1'])

        expect(mockApi.getProjectCollaborators).toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Jane S.'))
    })

    it('throws error for non-shared project', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({
            id: 'proj-1',
            name: 'Private Project',
            isShared: false,
        })

        await expect(
            program.parseAsync(['node', 'td', 'project', 'collaborators', 'id:proj-1']),
        ).rejects.toThrow('not shared')
    })

    it('outputs JSON for workspace project with --json', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({
            id: 'proj-1',
            name: 'Work Project',
            workspaceId: '123',
        })
        mockApi.getWorkspaceUsers.mockResolvedValue({
            workspaceUsers: [
                {
                    userId: 'user-1',
                    fullName: 'John Doe',
                    userEmail: 'john@example.com',
                    role: 'MEMBER',
                },
            ],
            hasMore: false,
        })

        await program.parseAsync(['node', 'td', 'project', 'collaborators', 'id:proj-1', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.results).toHaveLength(1)
        expect(parsed.results[0]).toEqual({
            id: 'user-1',
            name: 'John Doe',
            email: 'john@example.com',
            role: 'MEMBER',
        })
        expect(parsed.nextCursor).toBeNull()
    })

    it('outputs JSON for shared personal project with --json', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({
            id: 'proj-1',
            name: 'Shared Project',
            isShared: true,
        })
        mockApi.getProjectCollaborators.mockResolvedValue({
            results: [{ id: 'user-1', name: 'Jane Smith', email: 'jane@example.com' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'project', 'collaborators', 'id:proj-1', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.results).toHaveLength(1)
        expect(parsed.results[0]).toEqual({
            id: 'user-1',
            name: 'Jane Smith',
            email: 'jane@example.com',
        })
        expect(parsed.nextCursor).toBeNull()
    })

    it('outputs NDJSON for workspace project with --ndjson', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({
            id: 'proj-1',
            name: 'Work Project',
            workspaceId: '123',
        })
        mockApi.getWorkspaceUsers.mockResolvedValue({
            workspaceUsers: [
                {
                    userId: 'user-1',
                    fullName: 'John Doe',
                    userEmail: 'john@example.com',
                    role: 'ADMIN',
                },
                {
                    userId: 'user-2',
                    fullName: 'Jane Smith',
                    userEmail: 'jane@example.com',
                    role: 'MEMBER',
                },
            ],
            hasMore: false,
        })

        await program.parseAsync([
            'node',
            'td',
            'project',
            'collaborators',
            'id:proj-1',
            '--ndjson',
        ])

        expect(consoleSpy).toHaveBeenCalledTimes(2)
        const line1 = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(line1.id).toBe('user-1')
        const line2 = JSON.parse(consoleSpy.mock.calls[1][0])
        expect(line2.id).toBe('user-2')
    })
})

describe('project delete', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('shows dry-run without --yes', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Test Project' }],
            nextCursor: null,
        })
        mockApi.getTasks.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'project', 'delete', 'Test Project'])

        expect(mockApi.deleteProject).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith('Would delete project: Test Project')
        expect(consoleSpy).toHaveBeenCalledWith('Use --yes to confirm.')
        consoleSpy.mockRestore()
    })

    it('deletes project with --yes when no tasks', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Test Project' }],
            nextCursor: null,
        })
        mockApi.getTasks.mockResolvedValue({ results: [], nextCursor: null })
        mockApi.deleteProject.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'project', 'delete', 'Test Project', '--yes'])

        expect(mockApi.deleteProject).toHaveBeenCalledWith('proj-1')
        expect(consoleSpy).toHaveBeenCalledWith('Deleted project: Test Project (id:proj-1)')
        consoleSpy.mockRestore()
    })

    it('fails when project has uncompleted tasks', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Test Project' }],
            nextCursor: null,
        })
        mockApi.getTasks.mockResolvedValue({
            results: [{ id: 't1' }, { id: 't2' }],
            nextCursor: null,
        })

        await expect(
            program.parseAsync(['node', 'td', 'project', 'delete', 'Test Project', '--yes']),
        ).rejects.toThrow('2 uncompleted tasks remain')
    })

    it('fails when workspace project is not archived', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [
                { id: 'proj-1', name: 'Work Project', workspaceId: 'ws-1', isArchived: false },
            ],
            nextCursor: null,
        })

        await expect(
            program.parseAsync(['node', 'td', 'project', 'delete', 'Work Project', '--yes']),
        ).rejects.toThrow('needs to be archived first')
    })

    it('shows singular "task" for single uncompleted task', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Test Project' }],
            nextCursor: null,
        })
        mockApi.getTasks.mockResolvedValue({
            results: [{ id: 't1' }],
            nextCursor: null,
        })

        await expect(
            program.parseAsync(['node', 'td', 'project', 'delete', 'Test Project', '--yes']),
        ).rejects.toThrow('1 uncompleted task remain')
    })
})

describe('project create', () => {
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

    it('creates project with name', async () => {
        const program = createProgram()

        mockApi.addProject.mockResolvedValue({
            id: 'proj-new',
            name: 'New Project',
        })

        await program.parseAsync(['node', 'td', 'project', 'create', '--name', 'New Project'])

        expect(mockApi.addProject).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'New Project' }),
        )
        expect(consoleSpy).toHaveBeenCalledWith('Created: New Project')
    })

    it('creates project with --color and --favorite', async () => {
        const program = createProgram()

        mockApi.addProject.mockResolvedValue({
            id: 'proj-new',
            name: 'Colored Project',
            color: 'blue',
            isFavorite: true,
        })

        await program.parseAsync([
            'node',
            'td',
            'project',
            'create',
            '--name',
            'Colored Project',
            '--color',
            'blue',
            '--favorite',
        ])

        expect(mockApi.addProject).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'Colored Project',
                color: 'blue',
                isFavorite: true,
            }),
        )
    })

    it('creates sub-project with --parent for personal project', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'parent-1', name: 'Parent Project' }],
            nextCursor: null,
        })
        mockApi.addProject.mockResolvedValue({
            id: 'proj-new',
            name: 'Sub Project',
        })

        await program.parseAsync([
            'node',
            'td',
            'project',
            'create',
            '--name',
            'Sub Project',
            '--parent',
            'Parent Project',
        ])

        expect(mockApi.addProject).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'Sub Project',
                parentId: 'parent-1',
            }),
        )
    })

    it('rejects --parent for workspace project', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'ws-proj-1', name: 'Workspace Project', workspaceId: 'ws-1' }],
            nextCursor: null,
        })

        await expect(
            program.parseAsync([
                'node',
                'td',
                'project',
                'create',
                '--name',
                'Sub Project',
                '--parent',
                'Workspace Project',
            ]),
        ).rejects.toHaveProperty('code', 'WORKSPACE_NO_SUBPROJECTS')
    })

    it('shows project ID after creation', async () => {
        const program = createProgram()

        mockApi.addProject.mockResolvedValue({ id: 'proj-xyz', name: 'Test' })

        await program.parseAsync(['node', 'td', 'project', 'create', '--name', 'Test'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('proj-xyz'))
    })
})

describe('project update', () => {
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

    it('updates project name', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Old Name' }],
            nextCursor: null,
        })
        mockApi.updateProject.mockResolvedValue({ id: 'proj-1', name: 'New Name' })

        await program.parseAsync([
            'node',
            'td',
            'project',
            'update',
            'Old Name',
            '--name',
            'New Name',
        ])

        expect(mockApi.updateProject).toHaveBeenCalledWith('proj-1', {
            name: 'New Name',
        })
        expect(consoleSpy).toHaveBeenCalledWith('Updated: New Name (id:proj-1)')
    })

    it('updates project color and favorite', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({ id: 'proj-1', name: 'My Project' })
        mockApi.updateProject.mockResolvedValue({
            id: 'proj-1',
            name: 'My Project',
            color: 'red',
            isFavorite: true,
        })

        await program.parseAsync([
            'node',
            'td',
            'project',
            'update',
            'id:proj-1',
            '--color',
            'red',
            '--favorite',
        ])

        expect(mockApi.updateProject).toHaveBeenCalledWith('proj-1', {
            color: 'red',
            isFavorite: true,
        })
    })

    it('removes favorite with --no-favorite', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({
            id: 'proj-1',
            name: 'My Project',
            isFavorite: true,
        })
        mockApi.updateProject.mockResolvedValue({
            id: 'proj-1',
            name: 'My Project',
            isFavorite: false,
        })

        await program.parseAsync(['node', 'td', 'project', 'update', 'id:proj-1', '--no-favorite'])

        expect(mockApi.updateProject).toHaveBeenCalledWith('proj-1', {
            isFavorite: false,
        })
    })

    it('updates view-style', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({ id: 'proj-1', name: 'My Project' })
        mockApi.updateProject.mockResolvedValue({
            id: 'proj-1',
            name: 'My Project',
            viewStyle: 'board',
        })

        await program.parseAsync([
            'node',
            'td',
            'project',
            'update',
            'id:proj-1',
            '--view-style',
            'board',
        ])

        expect(mockApi.updateProject).toHaveBeenCalledWith('proj-1', {
            viewStyle: 'board',
        })
    })

    it('throws when no changes specified', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({ id: 'proj-1', name: 'My Project' })

        await expect(
            program.parseAsync(['node', 'td', 'project', 'update', 'id:proj-1']),
        ).rejects.toHaveProperty('code', 'NO_CHANGES')
    })
})

describe('project create --json', () => {
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

    it('outputs created project as JSON', async () => {
        const program = createProgram()

        mockApi.addProject.mockResolvedValue({
            id: 'proj-new',
            name: 'New Project',
            color: 'charcoal',
            isFavorite: false,
        })

        await program.parseAsync([
            'node',
            'td',
            'project',
            'create',
            '--name',
            'New Project',
            '--json',
        ])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.id).toBe('proj-new')
        expect(parsed.name).toBe('New Project')
        expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Created:'))
    })
})

describe('project update --json', () => {
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

    it('outputs updated project as JSON', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({ id: 'proj-1', name: 'Old Name' })
        mockApi.updateProject.mockResolvedValue({
            id: 'proj-1',
            name: 'New Name',
            color: 'charcoal',
        })

        await program.parseAsync([
            'node',
            'td',
            'project',
            'update',
            'id:proj-1',
            '--name',
            'New Name',
            '--json',
        ])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.id).toBe('proj-1')
        expect(parsed.name).toBe('New Name')
        expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Updated:'))
    })
})

describe('project archive', () => {
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

    it('archives project by name', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'My Project', isArchived: false }],
            nextCursor: null,
        })
        mockApi.archiveProject.mockResolvedValue({
            id: 'proj-1',
            name: 'My Project',
        })

        await program.parseAsync(['node', 'td', 'project', 'archive', 'My Project'])

        expect(mockApi.archiveProject).toHaveBeenCalledWith('proj-1')
        expect(consoleSpy).toHaveBeenCalledWith('Archived: My Project (id:proj-1)')
    })

    it('archives project by id: prefix', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({
            id: 'proj-1',
            name: 'My Project',
            isArchived: false,
        })
        mockApi.archiveProject.mockResolvedValue({
            id: 'proj-1',
            name: 'My Project',
        })

        await program.parseAsync(['node', 'td', 'project', 'archive', 'id:proj-1'])

        expect(mockApi.archiveProject).toHaveBeenCalledWith('proj-1')
    })

    it('shows message for already archived project', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({ id: 'proj-1', name: 'My Project', isArchived: true })

        await program.parseAsync(['node', 'td', 'project', 'archive', 'id:proj-1'])

        expect(mockApi.archiveProject).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith('Project already archived.')
    })
})

describe('project unarchive', () => {
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

    it('unarchives project by name', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'My Project', isArchived: true }],
            nextCursor: null,
        })
        mockApi.unarchiveProject.mockResolvedValue({
            id: 'proj-1',
            name: 'My Project',
        })

        await program.parseAsync(['node', 'td', 'project', 'unarchive', 'My Project'])

        expect(mockApi.unarchiveProject).toHaveBeenCalledWith('proj-1')
        expect(consoleSpy).toHaveBeenCalledWith('Unarchived: My Project (id:proj-1)')
    })

    it('unarchives project by id: prefix', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({ id: 'proj-1', name: 'My Project', isArchived: true })
        mockApi.unarchiveProject.mockResolvedValue({
            id: 'proj-1',
            name: 'My Project',
        })

        await program.parseAsync(['node', 'td', 'project', 'unarchive', 'id:proj-1'])

        expect(mockApi.unarchiveProject).toHaveBeenCalledWith('proj-1')
    })

    it('shows message for non-archived project', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({
            id: 'proj-1',
            name: 'My Project',
            isArchived: false,
        })

        await program.parseAsync(['node', 'td', 'project', 'unarchive', 'id:proj-1'])

        expect(mockApi.unarchiveProject).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith('Project is not archived.')
    })
})

describe('project browse', () => {
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

    it('opens project in browser by name', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'project', 'browse', 'Work'])

        expect(mockOpenInBrowser).toHaveBeenCalledWith('https://app.todoist.com/app/project/proj-1')
    })

    it('opens project in browser by id:', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({ id: 'proj-123', name: 'Test' })

        await program.parseAsync(['node', 'td', 'project', 'browse', 'id:proj-123'])

        expect(mockOpenInBrowser).toHaveBeenCalledWith(
            'https://app.todoist.com/app/project/proj-123',
        )
    })
})

describe('project move', () => {
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

    it('shows help when no ref provided', async () => {
        const program = createProgram()
        const helpSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

        try {
            await program.parseAsync(['node', 'td', 'project', 'move'])
        } catch {
            // exitOverride throws
        }

        helpSpy.mockRestore()
    })

    it('errors when neither --to-workspace nor --to-personal specified', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'My Project' }],
            nextCursor: null,
        })

        await expect(
            program.parseAsync(['node', 'td', 'project', 'move', 'My Project']),
        ).rejects.toHaveProperty('code', 'MISSING_DESTINATION')
    })

    it('errors when both --to-workspace and --to-personal specified', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync([
                'node',
                'td',
                'project',
                'move',
                'My Project',
                '--to-workspace',
                'Acme',
                '--to-personal',
            ]),
        ).rejects.toHaveProperty('code', 'INVALID_OPTIONS')
    })

    it('errors when --folder without --to-workspace', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync([
                'node',
                'td',
                'project',
                'move',
                'My Project',
                '--to-personal',
                '--folder',
                'Engineering',
            ]),
        ).rejects.toHaveProperty('code', 'INVALID_OPTIONS')
    })

    it('errors when --visibility without --to-workspace', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync([
                'node',
                'td',
                'project',
                'move',
                'My Project',
                '--to-personal',
                '--visibility',
                'team',
            ]),
        ).rejects.toHaveProperty('code', 'INVALID_OPTIONS')
    })

    it('errors when invalid --visibility value', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'My Project' }],
            nextCursor: null,
        })
        mockFetchWorkspaces.mockResolvedValue([{ id: 'ws-1', name: 'Acme Corp' } as Workspace])

        await expect(
            program.parseAsync([
                'node',
                'td',
                'project',
                'move',
                'My Project',
                '--to-workspace',
                'Acme',
                '--visibility',
                'invalid',
            ]),
        ).rejects.toHaveProperty('code', 'INVALID_VISIBILITY')
    })

    it('moves project to workspace', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'My Project' }],
            nextCursor: null,
        })
        mockFetchWorkspaces.mockResolvedValue([{ id: 'ws-1', name: 'Acme Corp' } as Workspace])
        mockApi.moveProjectToWorkspace.mockResolvedValue({
            id: 'proj-1',
            name: 'My Project',
            workspaceId: 'ws-1',
        })

        await program.parseAsync([
            'node',
            'td',
            'project',
            'move',
            'My Project',
            '--to-workspace',
            'Acme Corp',
            '--yes',
        ])

        expect(mockApi.moveProjectToWorkspace).toHaveBeenCalledWith({
            projectId: 'proj-1',
            workspaceId: 'ws-1',
        })
        expect(consoleSpy).toHaveBeenCalledWith(
            'Moved "My Project" to workspace "Acme Corp" (id:proj-1)',
        )
    })

    it('moves project to workspace with --folder', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'My Project' }],
            nextCursor: null,
        })
        mockFetchWorkspaces.mockResolvedValue([{ id: 'ws-1', name: 'Acme Corp' } as Workspace])
        mockFetchWorkspaceFolders.mockResolvedValue([
            { id: 'folder-1', name: 'Engineering', workspaceId: 'ws-1' },
        ])
        mockApi.moveProjectToWorkspace.mockResolvedValue({
            id: 'proj-1',
            name: 'My Project',
            workspaceId: 'ws-1',
            folderId: 'folder-1',
        })

        await program.parseAsync([
            'node',
            'td',
            'project',
            'move',
            'My Project',
            '--to-workspace',
            'Acme Corp',
            '--folder',
            'Eng',
            '--yes',
        ])

        expect(mockApi.moveProjectToWorkspace).toHaveBeenCalledWith({
            projectId: 'proj-1',
            workspaceId: 'ws-1',
            folderId: 'folder-1',
        })
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('folder: Engineering'))
    })

    it('moves project to workspace with --visibility', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'My Project' }],
            nextCursor: null,
        })
        mockFetchWorkspaces.mockResolvedValue([{ id: 'ws-1', name: 'Acme Corp' } as Workspace])
        mockApi.moveProjectToWorkspace.mockResolvedValue({
            id: 'proj-1',
            name: 'My Project',
            workspaceId: 'ws-1',
        })

        await program.parseAsync([
            'node',
            'td',
            'project',
            'move',
            'My Project',
            '--to-workspace',
            'Acme Corp',
            '--visibility',
            'team',
            '--yes',
        ])

        expect(mockApi.moveProjectToWorkspace).toHaveBeenCalledWith({
            projectId: 'proj-1',
            workspaceId: 'ws-1',
            access: { visibility: 'team' },
        })
    })

    it('moves project to personal', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({
            id: 'proj-ws-1',
            name: 'Team Project',
            workspaceId: 'ws-1',
        })
        mockApi.moveProjectToPersonal.mockResolvedValue({
            id: 'proj-ws-1',
            name: 'Team Project',
        })

        await program.parseAsync([
            'node',
            'td',
            'project',
            'move',
            'id:proj-ws-1',
            '--to-personal',
            '--yes',
        ])

        expect(mockApi.moveProjectToPersonal).toHaveBeenCalledWith({
            projectId: 'proj-ws-1',
        })
        expect(consoleSpy).toHaveBeenCalledWith('Moved "Team Project" to personal (id:proj-ws-1)')
    })

    it('shows dry-run when moving to workspace without --yes', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'My Project' }],
            nextCursor: null,
        })
        mockFetchWorkspaces.mockResolvedValue([{ id: 'ws-1', name: 'Acme Corp' } as Workspace])

        await program.parseAsync([
            'node',
            'td',
            'project',
            'move',
            'My Project',
            '--to-workspace',
            'Acme Corp',
        ])

        expect(mockApi.moveProjectToWorkspace).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith('Would move "My Project" to workspace "Acme Corp"')
        expect(consoleSpy).toHaveBeenCalledWith('Use --yes to confirm.')
    })

    it('shows dry-run when moving to personal without --yes', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({
            id: 'proj-ws-1',
            name: 'Team Project',
            workspaceId: 'ws-1',
        })

        await program.parseAsync(['node', 'td', 'project', 'move', 'id:proj-ws-1', '--to-personal'])

        expect(mockApi.moveProjectToPersonal).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith('Would move "Team Project" to personal')
        expect(consoleSpy).toHaveBeenCalledWith('Use --yes to confirm.')
    })

    it('errors when moving personal project --to-personal', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'My Project' }],
            nextCursor: null,
        })

        await expect(
            program.parseAsync(['node', 'td', 'project', 'move', 'My Project', '--to-personal']),
        ).rejects.toHaveProperty('code', 'ALREADY_PERSONAL')
    })

    it('errors when moving workspace project to same workspace', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({
            id: 'proj-ws-1',
            name: 'Team Project',
            workspaceId: 'ws-1',
        })
        mockFetchWorkspaces.mockResolvedValue([{ id: 'ws-1', name: 'Acme Corp' } as Workspace])

        await expect(
            program.parseAsync([
                'node',
                'td',
                'project',
                'move',
                'id:proj-ws-1',
                '--to-workspace',
                'Acme Corp',
            ]),
        ).rejects.toHaveProperty('code', 'SAME_WORKSPACE')
    })
})

describe('project (no args)', () => {
    it('shows parent help listing all subcommands', async () => {
        const program = createProgram()
        const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

        try {
            await program.parseAsync(['node', 'td', 'project'])
        } catch (err: unknown) {
            if ((err as { code?: string }).code !== 'commander.help') throw err
        }

        const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
        expect(output).toContain('list')
        expect(output).toContain('create')
        expect(output).toContain('delete')
        expect(output).toContain('update')
        expect(output).toContain('view')
        expect(output).toContain('Examples:')
        stdoutSpy.mockRestore()
    })
})

describe('project --dry-run', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('project create --dry-run previews without calling API', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync([
            'node',
            'td',
            'project',
            'create',
            '--name',
            'Test Project',
            '--dry-run',
        ])

        expect(mockApi.addProject).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would create project'))
        consoleSpy.mockRestore()
    })

    it('project update --dry-run previews without calling API', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Old Name' }],
            nextCursor: null,
        })

        await program.parseAsync([
            'node',
            'td',
            'project',
            'update',
            'Old Name',
            '--name',
            'New Name',
            '--dry-run',
        ])

        expect(mockApi.updateProject).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would update project'))
        consoleSpy.mockRestore()
    })

    it('project archive --dry-run previews without calling API', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Test', isArchived: false }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'project', 'archive', 'Test', '--dry-run'])

        expect(mockApi.archiveProject).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would archive project'))
        consoleSpy.mockRestore()
    })

    it('project delete --dry-run --yes still does not execute', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Empty Project' }],
            nextCursor: null,
        })
        mockApi.getTasks.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync([
            'node',
            'td',
            'project',
            'delete',
            'Empty Project',
            '--dry-run',
            '--yes',
        ])

        expect(mockApi.deleteProject).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would delete project'))
        consoleSpy.mockRestore()
    })
})

describe('project archived-count', () => {
    let mockApi: MockApi
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        vi.mocked(getApi).mockResolvedValue(mockApi)
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
        consoleSpy.mockRestore()
    })

    it('shows count in human-readable format', async () => {
        const program = createProgram()

        mockApi.getArchivedProjectsCount.mockResolvedValue({ count: 5 })

        await program.parseAsync(['node', 'td', 'project', 'archived-count'])

        expect(consoleSpy).toHaveBeenCalledWith('Archived projects: 5')
    })

    it('outputs JSON with --json', async () => {
        const program = createProgram()

        mockApi.getArchivedProjectsCount.mockResolvedValue({ count: 42 })

        await program.parseAsync(['node', 'td', 'project', 'archived-count', '--json'])

        const output = consoleSpy.mock.calls[0]?.[0] as string
        expect(JSON.parse(output)).toEqual({ count: 42 })
    })

    it('passes workspace filter', async () => {
        const program = createProgram()

        vi.mocked(fetchWorkspaces).mockResolvedValue([{ id: '100', name: 'Work' } as Workspace])
        mockApi.getArchivedProjectsCount.mockResolvedValue({ count: 3 })

        await program.parseAsync(['node', 'td', 'project', 'archived-count', '--workspace', 'Work'])

        expect(mockApi.getArchivedProjectsCount).toHaveBeenCalledWith(
            expect.objectContaining({ workspaceId: '100' }),
        )
        expect(consoleSpy).toHaveBeenCalledWith('Archived projects: 3 (workspace: Work)')
    })
})

describe('project permissions', () => {
    let mockApi: MockApi
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        vi.mocked(getApi).mockResolvedValue(mockApi)
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
        consoleSpy.mockRestore()
    })

    it('shows permissions in human-readable format', async () => {
        const program = createProgram()

        mockApi.getProjectPermissions.mockResolvedValue({
            projectCollaboratorActions: [
                { name: 'ADMIN', actions: [{ name: 'edit' }, { name: 'delete' }] },
            ],
            workspaceCollaboratorActions: [{ name: 'MEMBER', actions: [{ name: 'view' }] }],
        })

        await program.parseAsync(['node', 'td', 'project', 'permissions'])

        const allOutput = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n')
        expect(allOutput).toContain('ADMIN')
        expect(allOutput).toContain('edit')
        expect(allOutput).toContain('delete')
        expect(allOutput).toContain('MEMBER')
        expect(allOutput).toContain('view')
    })

    it('outputs JSON with --json', async () => {
        const program = createProgram()

        const permissions = {
            projectCollaboratorActions: [{ name: 'ADMIN', actions: [{ name: 'edit' }] }],
            workspaceCollaboratorActions: [],
        }
        mockApi.getProjectPermissions.mockResolvedValue(permissions)

        await program.parseAsync(['node', 'td', 'project', 'permissions', '--json'])

        const output = consoleSpy.mock.calls[0]?.[0] as string
        expect(JSON.parse(output)).toEqual(permissions)
    })
})

describe('project view --detailed', () => {
    let mockApi: MockApi
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        vi.mocked(getApi).mockResolvedValue(mockApi)
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
        consoleSpy.mockRestore()
    })

    it('uses getFullProject and shows sections and collaborators', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'My Project', color: 'blue', isFavorite: false }],
            nextCursor: null,
        })
        mockApi.getFullProject.mockResolvedValue({
            project: { id: 'proj-1', name: 'My Project', color: 'blue', isFavorite: false },
            commentsCount: 5,
            tasks: [{ id: 'task-1', content: 'Test task', projectId: 'proj-1' }],
            sections: [{ id: 'sec-1', name: 'Backlog', projectId: 'proj-1', order: 1 }],
            collaborators: [{ id: 'user-1', name: 'John Doe', email: 'john@example.com' }],
            notes: [{ id: 'note-1', content: 'A note' }],
        })

        await program.parseAsync(['node', 'td', 'project', 'view', 'My Project', '--detailed'])

        expect(mockApi.getFullProject).toHaveBeenCalledWith('proj-1')
        expect(mockApi.getTasks).not.toHaveBeenCalled()

        const allOutput = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n')
        expect(allOutput).toContain('Backlog')
        expect(allOutput).toContain('John')
        expect(allOutput).toContain('Comments: 5')
        expect(allOutput).toContain('A note')
    })

    it('outputs full JSON with --detailed --json', async () => {
        const program = createProgram()

        const fullData = {
            project: { id: 'proj-1', name: 'My Project', color: 'blue', isFavorite: false },
            commentsCount: 3,
            tasks: [],
            sections: [],
            collaborators: [],
            notes: [],
        }

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'My Project', color: 'blue', isFavorite: false }],
            nextCursor: null,
        })
        mockApi.getFullProject.mockResolvedValue(fullData)

        await program.parseAsync([
            'node',
            'td',
            'project',
            'view',
            'My Project',
            '--detailed',
            '--json',
        ])

        const output = consoleSpy.mock.calls[0]?.[0] as string
        expect(JSON.parse(output)).toEqual(fullData)
    })
})

describe('project join', () => {
    let mockApi: MockApi
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        vi.mocked(getApi).mockResolvedValue(mockApi)
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
        consoleSpy.mockRestore()
    })

    it('joins project and shows workspace name', async () => {
        const program = createProgram()

        mockApi.joinProject.mockResolvedValue({
            project: {
                id: 'proj-123',
                name: 'Shared Project',
                color: 'blue',
                isFavorite: false,
                workspaceId: 'ws-1',
            },
            tasks: [],
            sections: [],
            comments: [],
            collaborators: [],
            collaboratorStates: [],
            folder: null,
            subprojects: [],
        })
        mockApi.getWorkspace.mockResolvedValue({ id: 'ws-1', name: 'Acme Corp' })

        await program.parseAsync(['node', 'td', 'project', 'join', 'id:proj-123'])

        expect(mockApi.joinProject).toHaveBeenCalledWith('proj-123')
        expect(mockApi.getWorkspace).toHaveBeenCalledWith('ws-1')
        expect(consoleSpy).toHaveBeenCalledWith('Joined: Shared Project')
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Workspace: Acme Corp'))
    })

    it('rejects plain text references', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'td', 'project', 'join', 'My Project']),
        ).rejects.toHaveProperty('code', 'INVALID_REF')
    })

    it('--dry-run fetches project name and previews', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({
            id: 'proj-123',
            name: 'Shared Project',
        })

        await program.parseAsync(['node', 'td', 'project', 'join', 'id:proj-123', '--dry-run'])

        expect(mockApi.joinProject).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Shared Project'))
    })

    it('--dry-run falls back to ID when project fetch fails', async () => {
        const program = createProgram()

        mockApi.getProject.mockRejectedValue(new Error('Not found'))

        await program.parseAsync(['node', 'td', 'project', 'join', 'id:proj-123', '--dry-run'])

        expect(mockApi.joinProject).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('proj-123'))
    })

    it('outputs JSON with --json including workspace', async () => {
        const program = createProgram()

        mockApi.joinProject.mockResolvedValue({
            project: {
                id: 'proj-123',
                name: 'Shared Project',
                color: 'blue',
                isFavorite: false,
                workspaceId: 'ws-1',
            },
            tasks: [],
            sections: [],
            comments: [],
            collaborators: [],
            collaboratorStates: [],
            folder: null,
            subprojects: [],
        })
        mockApi.getWorkspace.mockResolvedValue({ id: 'ws-1', name: 'Acme Corp' })

        await program.parseAsync(['node', 'td', 'project', 'join', 'id:proj-123', '--json'])

        const output = consoleSpy.mock.calls[0]?.[0] as string
        const parsed = JSON.parse(output)
        expect(parsed).toMatchObject({
            project: { id: 'proj-123', name: 'Shared Project' },
            workspace: { id: 'ws-1', name: 'Acme Corp' },
        })
        expect(parsed.tasks).toBeUndefined()
    })

    it('handles personal shared project without workspace', async () => {
        const program = createProgram()

        mockApi.joinProject.mockResolvedValue({
            project: {
                id: 'proj-456',
                name: 'Personal Shared',
                color: 'blue',
                isFavorite: false,
            },
            tasks: [],
            sections: [],
            comments: [],
            collaborators: [],
            collaboratorStates: [],
            folder: null,
            subprojects: [],
        })

        await program.parseAsync(['node', 'td', 'project', 'join', 'id:proj-456'])

        expect(mockApi.getWorkspace).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith('Joined: Personal Shared')
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('ID: proj-456'))
        expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Workspace:'))
    })
})

describe('project progress', () => {
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

    it('shows progress for a project', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })
        mockApi.getProjectProgress.mockResolvedValue({
            projectId: 'proj-1',
            completedCount: 22,
            activeCount: 8,
            progressPercent: 73,
        })

        await program.parseAsync(['node', 'td', 'project', 'progress', 'Work'])

        expect(mockApi.getProjectProgress).toHaveBeenCalledWith('proj-1')
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('73%'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('22'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('8'))
    })

    it('outputs JSON with --json', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })
        mockApi.getProjectProgress.mockResolvedValue({
            projectId: 'proj-1',
            completedCount: 5,
            activeCount: 10,
            progressPercent: 33,
        })

        await program.parseAsync(['node', 'td', 'project', 'progress', 'Work', '--json'])

        const output = consoleSpy.mock.calls[0]?.[0] as string
        expect(JSON.parse(output)).toMatchObject({
            projectId: 'proj-1',
            completedCount: 5,
            progressPercent: 33,
        })
    })
})

describe('project health', () => {
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

    it('shows health status and description', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })
        mockApi.getProjectHealth.mockResolvedValue({
            status: 'ON_TRACK',
            description: 'Project is progressing well',
            taskRecommendations: [],
            isStale: false,
            updateInProgress: false,
        })

        await program.parseAsync(['node', 'td', 'project', 'health', 'Work'])

        expect(mockApi.getProjectHealth).toHaveBeenCalledWith('proj-1')
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('ON_TRACK'))
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('Project is progressing well'),
        )
    })

    it('shows stale indicator', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })
        mockApi.getProjectHealth.mockResolvedValue({
            status: 'UNKNOWN',
            isStale: true,
            updateInProgress: false,
        })

        await program.parseAsync(['node', 'td', 'project', 'health', 'Work'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('stale'))
    })

    it('shows task recommendations', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })
        mockApi.getProjectHealth.mockResolvedValue({
            status: 'AT_RISK',
            description: null,
            taskRecommendations: [{ taskId: 'task-1', recommendation: 'Set a due date' }],
            isStale: false,
            updateInProgress: false,
        })

        await program.parseAsync(['node', 'td', 'project', 'health', 'Work'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Set a due date'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('task-1'))
    })

    it('outputs JSON with --json', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })
        mockApi.getProjectHealth.mockResolvedValue({
            status: 'ON_TRACK',
            isStale: false,
            updateInProgress: false,
        })

        await program.parseAsync(['node', 'td', 'project', 'health', 'Work', '--json'])

        const output = consoleSpy.mock.calls[0]?.[0] as string
        expect(JSON.parse(output)).toMatchObject({ status: 'ON_TRACK' })
    })
})

describe('project health-context', () => {
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

    it('shows project metrics', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })
        mockApi.getProjectHealthContext.mockResolvedValue({
            projectId: 'proj-1',
            projectName: 'Work',
            projectDescription: null,
            projectMetrics: {
                totalTasks: 42,
                completedTasks: 30,
                overdueTasks: 3,
                tasksCreatedThisWeek: 5,
                tasksCompletedThisWeek: 4,
                averageCompletionTime: 2.3,
            },
            tasks: [],
        })

        await program.parseAsync(['node', 'td', 'project', 'health-context', 'Work'])

        expect(mockApi.getProjectHealthContext).toHaveBeenCalledWith('proj-1')
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('42'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('30'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('3'))
    })

    it('outputs JSON with --json', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })
        mockApi.getProjectHealthContext.mockResolvedValue({
            projectId: 'proj-1',
            projectName: 'Work',
            projectDescription: null,
            projectMetrics: {
                totalTasks: 10,
                completedTasks: 5,
                overdueTasks: 0,
                tasksCreatedThisWeek: 0,
                tasksCompletedThisWeek: 0,
                averageCompletionTime: null,
            },
            tasks: [],
        })

        await program.parseAsync(['node', 'td', 'project', 'health-context', 'Work', '--json'])

        const output = consoleSpy.mock.calls[0]?.[0] as string
        expect(JSON.parse(output)).toMatchObject({ projectId: 'proj-1' })
    })
})

describe('project activity-stats', () => {
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

    it('shows daily activity', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })
        mockApi.getProjectActivityStats.mockResolvedValue({
            dayItems: [
                { date: '2026-03-29', totalCount: 12 },
                { date: '2026-03-28', totalCount: 8 },
            ],
            weekItems: null,
        })

        await program.parseAsync(['node', 'td', 'project', 'activity-stats', 'Work'])

        expect(mockApi.getProjectActivityStats).toHaveBeenCalledWith('proj-1', {})
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('2026-03-29'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('12'))
    })

    it('passes weeks and include-weekly options', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })
        mockApi.getProjectActivityStats.mockResolvedValue({
            dayItems: [],
            weekItems: [{ fromDate: '2026-03-24', toDate: '2026-03-30', totalCount: 40 }],
        })

        await program.parseAsync([
            'node',
            'td',
            'project',
            'activity-stats',
            'Work',
            '--weeks',
            '4',
            '--include-weekly',
        ])

        expect(mockApi.getProjectActivityStats).toHaveBeenCalledWith('proj-1', {
            weeks: 4,
            includeWeeklyCounts: true,
        })
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('2026-03-24'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('40'))
    })

    it('rejects invalid --weeks values', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })

        await expect(
            program.parseAsync([
                'node',
                'td',
                'project',
                'activity-stats',
                'Work',
                '--weeks',
                'foo',
            ]),
        ).rejects.toHaveProperty('code', 'INVALID_WEEKS')

        await expect(
            program.parseAsync([
                'node',
                'td',
                'project',
                'activity-stats',
                'Work',
                '--weeks',
                '15',
            ]),
        ).rejects.toHaveProperty('code', 'INVALID_WEEKS')
    })

    it('outputs JSON with --json', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })
        mockApi.getProjectActivityStats.mockResolvedValue({
            dayItems: [{ date: '2026-03-29', totalCount: 5 }],
            weekItems: null,
        })

        await program.parseAsync(['node', 'td', 'project', 'activity-stats', 'Work', '--json'])

        const output = consoleSpy.mock.calls[0]?.[0] as string
        expect(JSON.parse(output)).toMatchObject({
            dayItems: [{ date: '2026-03-29', totalCount: 5 }],
        })
    })
})

describe('project analyze-health', () => {
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

    it('triggers analysis and shows confirmation', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })
        mockApi.analyzeProjectHealth.mockResolvedValue({
            status: 'AT_RISK',
            isStale: false,
            updateInProgress: true,
        })

        await program.parseAsync(['node', 'td', 'project', 'analyze-health', 'Work'])

        expect(mockApi.analyzeProjectHealth).toHaveBeenCalledWith('proj-1')
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Work'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('in progress'))
    })

    it('shows dry-run preview without calling API', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'project', 'analyze-health', 'Work', '--dry-run'])

        expect(mockApi.analyzeProjectHealth).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('dry-run'))
    })

    it('outputs JSON with --json', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })
        mockApi.analyzeProjectHealth.mockResolvedValue({
            status: 'AT_RISK',
            description: 'Several tasks overdue',
            isStale: false,
            updateInProgress: true,
        })

        await program.parseAsync(['node', 'td', 'project', 'analyze-health', 'Work', '--json'])

        const output = consoleSpy.mock.calls[0]?.[0] as string
        expect(JSON.parse(output)).toMatchObject({ status: 'AT_RISK' })
    })
})
