import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api/core.js', () => ({
    getApi: vi.fn(),
    isWorkspaceProject: vi.fn(
        (project: { workspaceId?: string }) => project.workspaceId !== undefined,
    ),
}))

vi.mock('../lib/api/workspaces.js', () => ({
    fetchWorkspaces: vi.fn(),
    fetchWorkspaceFolders: vi.fn(),
}))

import { registerWorkspaceCommand } from '../commands/workspace.js'
import { getApi } from '../lib/api/core.js'
import { fetchWorkspaceFolders, fetchWorkspaces } from '../lib/api/workspaces.js'

const mockGetApi = vi.mocked(getApi)
const mockFetchWorkspaces = vi.mocked(fetchWorkspaces)
const mockFetchWorkspaceFolders = vi.mocked(fetchWorkspaceFolders)

function createMockApi() {
    return {
        getProjects: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        getWorkspaceUsers: vi.fn().mockResolvedValue({ workspaceUsers: [], hasMore: false }),
    }
}

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerWorkspaceCommand(program)
    return program
}

const mockWorkspaces = [
    {
        id: 'ws-1',
        name: 'Doist',
        role: 'MEMBER' as const,
        plan: 'BUSINESS',
        domainName: 'doist.com',
        currentMemberCount: 143,
        currentActiveProjects: 497,
        memberCountByType: { adminCount: 3, memberCount: 124, guestCount: 16 },
    },
    {
        id: 'ws-2',
        name: 'Playground',
        role: 'ADMIN' as const,
        plan: 'STARTER',
        domainName: null,
        currentMemberCount: 2,
        currentActiveProjects: 5,
        memberCountByType: { adminCount: 1, memberCount: 1, guestCount: 0 },
    },
]

describe('workspace list', () => {
    let mockApi: ReturnType<typeof createMockApi>
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
        mockFetchWorkspaces.mockResolvedValue(mockWorkspaces)
        mockFetchWorkspaceFolders.mockResolvedValue([])
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
        consoleSpy.mockRestore()
    })

    it('lists all workspaces', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'list'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Doist'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Playground'))
    })

    it('shows member and project counts', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'list'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('143 members'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('497 projects'))
    })

    it('shows role indicators', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'list'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[MEMBER]'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[ADMIN]'))
    })

    it('outputs nothing when no workspaces', async () => {
        mockFetchWorkspaces.mockResolvedValue([])
        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'list'])

        expect(consoleSpy).not.toHaveBeenCalled()
    })

    it('outputs JSON with --json flag', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'list', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.results).toBeDefined()
        expect(parsed.results[0].name).toBe('Doist')
        expect(parsed.results[0].memberCount).toBe(143)
    })

    it('outputs NDJSON with --ndjson flag', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'list', '--ndjson'])

        expect(consoleSpy).toHaveBeenCalledTimes(2)
        const first = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(first.name).toBe('Doist')
    })

    it('shows id: prefix on workspace IDs', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'list'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('id:ws-1'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('id:ws-2'))
    })
})

describe('workspace view', () => {
    let mockApi: ReturnType<typeof createMockApi>
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
        mockFetchWorkspaces.mockResolvedValue(mockWorkspaces)
        mockFetchWorkspaceFolders.mockResolvedValue([])
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
        consoleSpy.mockRestore()
    })

    it('resolves workspace by name', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'view', 'Doist'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Doist'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('ID:'))
    })

    it('resolves workspace by partial name', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'view', 'doi'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Doist'))
    })

    it('resolves workspace by id: prefix', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'view', 'id:ws-1'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Doist'))
    })

    it('implicit view: td workspace <ref> behaves like td workspace view <ref>', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'id:ws-1'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Doist'))
    })

    it('shows workspace details', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'view', 'Doist'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Plan:'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('BUSINESS'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Members:'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Projects:'))
    })

    it('shows domain when available', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'view', 'Doist'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Domain:'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('doist.com'))
    })

    it('throws for non-existent workspace', async () => {
        const program = createProgram()
        await expect(
            program.parseAsync(['node', 'td', 'workspace', 'view', 'nonexistent']),
        ).rejects.toThrow('not found')
    })

    it('throws for ambiguous workspace name', async () => {
        mockFetchWorkspaces.mockResolvedValue([
            { ...mockWorkspaces[0], name: 'Test Workspace' },
            { ...mockWorkspaces[1], name: 'Test Project' },
        ])
        const program = createProgram()
        await expect(
            program.parseAsync(['node', 'td', 'workspace', 'view', 'Test']),
        ).rejects.toThrow('Multiple workspaces')
    })
})

describe('workspace projects', () => {
    let mockApi: ReturnType<typeof createMockApi>
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
        mockFetchWorkspaces.mockResolvedValue(mockWorkspaces)
        mockFetchWorkspaceFolders.mockResolvedValue([
            { id: 'folder-1', name: 'Engineering', workspaceId: 'ws-1' },
            { id: 'folder-2', name: 'Marketing', workspaceId: 'ws-1' },
        ])
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
        consoleSpy.mockRestore()
    })

    it('lists projects grouped by folder', async () => {
        mockApi.getProjects.mockResolvedValue({
            results: [
                {
                    id: 'proj-1',
                    name: 'Backend',
                    workspaceId: 'ws-1',
                    folderId: 'folder-1',
                    status: 'IN_PROGRESS',
                },
                {
                    id: 'proj-2',
                    name: 'Campaign',
                    workspaceId: 'ws-1',
                    folderId: 'folder-2',
                    status: 'COMPLETED',
                },
                {
                    id: 'proj-3',
                    name: 'General',
                    workspaceId: 'ws-1',
                    folderId: null,
                    status: 'IN_PROGRESS',
                },
            ],
            nextCursor: null,
        })

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'projects', 'Doist'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Engineering/'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Marketing/'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Backend'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Campaign'))
    })

    it('shows projects without status indicator', async () => {
        mockApi.getProjects.mockResolvedValue({
            results: [
                {
                    id: 'proj-1',
                    name: 'Backend',
                    workspaceId: 'ws-1',
                    folderId: null,
                    status: 'IN_PROGRESS',
                },
            ],
            nextCursor: null,
        })

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'projects', 'Doist'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Backend'))
    })

    it('outputs JSON with --json flag', async () => {
        mockApi.getProjects.mockResolvedValue({
            results: [
                {
                    id: 'proj-1',
                    name: 'Backend',
                    workspaceId: 'ws-1',
                    folderId: 'folder-1',
                    status: 'IN_PROGRESS',
                },
            ],
            nextCursor: null,
        })

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'projects', 'Doist', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.results[0].name).toBe('Backend')
        expect(parsed.results[0].folderName).toBe('Engineering')
    })

    it('shows id: prefix on project IDs', async () => {
        mockApi.getProjects.mockResolvedValue({
            results: [
                {
                    id: 'proj-1',
                    name: 'Backend',
                    workspaceId: 'ws-1',
                    folderId: 'folder-1',
                    status: 'IN_PROGRESS',
                },
            ],
            nextCursor: null,
        })

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'projects', 'Doist'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('id:proj-1'))
    })

    it('shows blank lines between folder groups', async () => {
        mockApi.getProjects.mockResolvedValue({
            results: [
                {
                    id: 'proj-1',
                    name: 'Backend',
                    workspaceId: 'ws-1',
                    folderId: 'folder-1',
                    status: 'IN_PROGRESS',
                },
                {
                    id: 'proj-2',
                    name: 'Campaign',
                    workspaceId: 'ws-1',
                    folderId: 'folder-2',
                    status: 'IN_PROGRESS',
                },
            ],
            nextCursor: null,
        })

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'projects', 'Doist'])

        const calls = consoleSpy.mock.calls.map((c: unknown[]) => c[0])
        const blankLineIndex = calls.findIndex((c: unknown) => c === '')
        expect(blankLineIndex).toBeGreaterThan(0)
    })

    it('shows (no folder) for projects without folder', async () => {
        mockApi.getProjects.mockResolvedValue({
            results: [
                {
                    id: 'proj-1',
                    name: 'Backend',
                    workspaceId: 'ws-1',
                    folderId: 'folder-1',
                    status: 'IN_PROGRESS',
                },
                {
                    id: 'proj-2',
                    name: 'Orphan',
                    workspaceId: 'ws-1',
                    folderId: null,
                    status: 'IN_PROGRESS',
                },
            ],
            nextCursor: null,
        })

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'projects', 'Doist'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('(no folder)'))
    })

    it('accepts --workspace flag instead of positional arg', async () => {
        mockApi.getProjects.mockResolvedValue({ results: [], nextCursor: null })

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'projects', '--workspace', 'Doist'])

        expect(mockApi.getProjects).toHaveBeenCalled()
    })

    it('errors when both positional and --workspace are provided', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync([
                'node',
                'td',
                'workspace',
                'projects',
                'Doist',
                '--workspace',
                'Other',
            ]),
        ).rejects.toThrow('Cannot specify workspace both as argument and --workspace flag')
    })
})

describe('workspace users', () => {
    let mockApi: ReturnType<typeof createMockApi>
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
        mockFetchWorkspaces.mockResolvedValue(mockWorkspaces)
        mockFetchWorkspaceFolders.mockResolvedValue([])
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
        consoleSpy.mockRestore()
    })

    it('lists workspace users', async () => {
        mockApi.getWorkspaceUsers.mockResolvedValue({
            workspaceUsers: [
                {
                    userId: 'user-1',
                    userEmail: 'alice@example.com',
                    fullName: 'Alice Smith',
                    role: 'ADMIN',
                },
                {
                    userId: 'user-2',
                    userEmail: 'bob@example.com',
                    fullName: 'Bob Jones',
                    role: 'MEMBER',
                },
            ],
            hasMore: false,
        })

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'users', 'Doist'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Alice S.'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Bob J.'))
    })

    it('shows user IDs with id: prefix', async () => {
        mockApi.getWorkspaceUsers.mockResolvedValue({
            workspaceUsers: [
                {
                    userId: 'user-1',
                    userEmail: 'alice@example.com',
                    fullName: 'Alice Smith',
                    role: 'ADMIN',
                },
            ],
            hasMore: false,
        })

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'users', 'Doist'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('id:user-1'))
    })

    it('shows role indicators', async () => {
        mockApi.getWorkspaceUsers.mockResolvedValue({
            workspaceUsers: [
                {
                    userId: 'user-1',
                    userEmail: 'alice@example.com',
                    fullName: 'Alice',
                    role: 'ADMIN',
                },
            ],
            hasMore: false,
        })

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'users', 'Doist'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[ADMIN]'))
    })

    it('filters by role', async () => {
        mockApi.getWorkspaceUsers.mockResolvedValue({
            workspaceUsers: [
                {
                    userId: 'user-1',
                    userEmail: 'alice@example.com',
                    fullName: 'Alice',
                    role: 'ADMIN',
                },
                {
                    userId: 'user-2',
                    userEmail: 'bob@example.com',
                    fullName: 'Bob',
                    role: 'MEMBER',
                },
            ],
            hasMore: false,
        })

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'users', 'Doist', '--role', 'ADMIN'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Alice'))
        expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Bob'))
    })

    it('filters by multiple roles', async () => {
        mockApi.getWorkspaceUsers.mockResolvedValue({
            workspaceUsers: [
                {
                    userId: 'user-1',
                    userEmail: 'alice@example.com',
                    fullName: 'Alice',
                    role: 'ADMIN',
                },
                {
                    userId: 'user-2',
                    userEmail: 'bob@example.com',
                    fullName: 'Bob',
                    role: 'MEMBER',
                },
                {
                    userId: 'user-3',
                    userEmail: 'carol@example.com',
                    fullName: 'Carol',
                    role: 'GUEST',
                },
            ],
            hasMore: false,
        })

        const program = createProgram()
        await program.parseAsync([
            'node',
            'td',
            'workspace',
            'users',
            'Doist',
            '--role',
            'ADMIN,MEMBER',
        ])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Alice'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Bob'))
        expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Carol'))
    })

    it('outputs JSON with --json flag', async () => {
        mockApi.getWorkspaceUsers.mockResolvedValue({
            workspaceUsers: [
                {
                    userId: 'user-1',
                    userEmail: 'alice@example.com',
                    fullName: 'Alice Smith',
                    role: 'ADMIN',
                },
            ],
            hasMore: false,
        })

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'users', 'Doist', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.results[0].name).toBe('Alice Smith')
        expect(parsed.results[0].email).toBe('alice@example.com')
    })

    it('accepts --workspace flag instead of positional arg', async () => {
        mockApi.getWorkspaceUsers.mockResolvedValue({
            workspaceUsers: [
                {
                    userId: 'user-1',
                    userEmail: 'alice@example.com',
                    fullName: 'Alice Smith',
                    role: 'ADMIN',
                },
            ],
            hasMore: false,
        })

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'users', '--workspace', 'Doist'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Alice'))
    })

    it('errors when both positional and --workspace are provided', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync([
                'node',
                'td',
                'workspace',
                'users',
                'Doist',
                '--workspace',
                'Other',
            ]),
        ).rejects.toThrow('Cannot specify workspace both as argument and --workspace flag')
    })
})
