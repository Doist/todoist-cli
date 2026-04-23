import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/api/core.js', () => ({
    getApi: vi.fn(),
}))

vi.mock('../../lib/api/workspaces.js', () => ({
    fetchWorkspaces: vi.fn(),
    fetchWorkspaceFolders: vi.fn(),
    clearWorkspaceCache: vi.fn(),
}))

vi.mock('../../lib/config.js', () => ({
    readConfig: vi.fn().mockResolvedValue({}),
    writeConfig: vi.fn().mockResolvedValue(undefined),
}))

import { getApi } from '../../lib/api/core.js'
import { fetchWorkspaceFolders, fetchWorkspaces } from '../../lib/api/workspaces.js'
import { readConfig, writeConfig } from '../../lib/config.js'
import { createMockApi, type MockApi } from '../../test-support/mock-api.js'
import { registerWorkspaceCommand } from './index.js'

const mockGetApi = vi.mocked(getApi)
const mockFetchWorkspaces = vi.mocked(fetchWorkspaces)
const mockFetchWorkspaceFolders = vi.mocked(fetchWorkspaceFolders)
const mockReadConfig = vi.mocked(readConfig)
const mockWriteConfig = vi.mocked(writeConfig)

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
    let mockApi: MockApi
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
    let mockApi: MockApi
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

    it('outputs JSON with --json', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'view', 'Doist', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.id).toBe('ws-1')
        expect(parsed.name).toBe('Doist')
        expect(parsed.plan).toBe('BUSINESS')
        expect(parsed.memberCount).toBeDefined()
        expect(parsed.projectCount).toBeDefined()
    })

    it('outputs full JSON with --json --full', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'view', 'Doist', '--json', '--full'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.id).toBe('ws-1')
        expect(parsed.memberCountByType).toBeDefined()
    })
})

describe('workspace projects', () => {
    let mockApi: MockApi
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
    let mockApi: MockApi
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

    it('rejects invalid role values', async () => {
        const program = createProgram()
        await expect(
            program.parseAsync(['node', 'td', 'workspace', 'users', 'Doist', '--role', 'BANANA']),
        ).rejects.toThrow(
            "error: option '--role <roles>' argument 'BANANA' is invalid. Allowed choices are ADMIN, MEMBER, GUEST.",
        )
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

describe('workspace insights', () => {
    let mockApi: MockApi
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
        mockFetchWorkspaces.mockResolvedValue(mockWorkspaces as never)
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
        consoleSpy.mockRestore()
    })

    it('shows insights for workspace projects', async () => {
        const program = createProgram()

        mockApi.getWorkspaceInsights.mockResolvedValue({
            folderId: null,
            projectInsights: [
                {
                    projectId: 'proj-1',
                    health: { status: 'ON_TRACK', isStale: false, updateInProgress: false },
                    progress: {
                        projectId: 'proj-1',
                        completedCount: 22,
                        activeCount: 8,
                        progressPercent: 73,
                    },
                },
            ],
        })
        mockApi.getWorkspaceActiveProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Backend API', workspaceId: 'ws-1' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'workspace', 'insights', 'Doist'])

        expect(mockApi.getWorkspaceInsights).toHaveBeenCalledWith('ws-1', {})
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Backend API'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('ON_TRACK'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('73%'))
    })

    it('handles null health and progress', async () => {
        const program = createProgram()

        mockApi.getWorkspaceInsights.mockResolvedValue({
            folderId: null,
            projectInsights: [{ projectId: 'proj-1', health: null, progress: null }],
        })
        mockApi.getWorkspaceActiveProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Empty Project', workspaceId: 'ws-1' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'workspace', 'insights', 'Doist'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('N/A'))
    })

    it('passes project-ids filter', async () => {
        const program = createProgram()

        mockApi.getWorkspaceInsights.mockResolvedValue({
            folderId: null,
            projectInsights: [],
        })
        mockApi.getWorkspaceActiveProjects.mockResolvedValue({
            results: [],
            nextCursor: null,
        })

        await program.parseAsync([
            'node',
            'td',
            'workspace',
            'insights',
            'Doist',
            '--project-ids',
            'proj-1,proj-2',
        ])

        expect(mockApi.getWorkspaceInsights).toHaveBeenCalledWith('ws-1', {
            projectIds: ['proj-1', 'proj-2'],
        })
    })

    it('outputs JSON with --json', async () => {
        const program = createProgram()

        const insightsData = {
            folderId: null,
            projectInsights: [
                {
                    projectId: 'proj-1',
                    health: { status: 'EXCELLENT', isStale: false, updateInProgress: false },
                    progress: {
                        projectId: 'proj-1',
                        completedCount: 18,
                        activeCount: 2,
                        progressPercent: 90,
                    },
                },
            ],
        }
        mockApi.getWorkspaceInsights.mockResolvedValue(insightsData)

        await program.parseAsync(['node', 'td', 'workspace', 'insights', 'Doist', '--json'])

        const output = consoleSpy.mock.calls[0]?.[0] as string
        expect(JSON.parse(output)).toMatchObject({
            folderId: null,
            projectInsights: [{ projectId: 'proj-1' }],
        })
    })
})

// --- CRUD tests ---

describe('workspace create', () => {
    let mockApi: MockApi
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
        mockFetchWorkspaces.mockResolvedValue(mockWorkspaces)
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
        consoleSpy.mockRestore()
    })

    it('creates a workspace with --name', async () => {
        mockApi.addWorkspace.mockResolvedValue({ id: 'ws-new', name: 'NewWS' })
        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'create', '--name', 'NewWS'])

        expect(mockApi.addWorkspace).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'NewWS' }),
        )
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Created: NewWS'))
    })

    it('passes through sharing and domain flags', async () => {
        mockApi.addWorkspace.mockResolvedValue({ id: 'ws-new', name: 'NewWS' })
        const program = createProgram()
        await program.parseAsync([
            'node',
            'td',
            'workspace',
            'create',
            '--name',
            'NewWS',
            '--description',
            'Hello',
            '--link-sharing',
            '--no-guest-access',
            '--domain',
            'acme.com',
        ])

        expect(mockApi.addWorkspace).toHaveBeenCalledWith({
            name: 'NewWS',
            description: 'Hello',
            isLinkSharingEnabled: true,
            isGuestAllowed: false,
            domainName: 'acme.com',
        })
    })

    it('--dry-run skips API and prints preview', async () => {
        const program = createProgram()
        await program.parseAsync([
            'node',
            'td',
            'workspace',
            'create',
            '--name',
            'NewWS',
            '--dry-run',
        ])

        expect(mockApi.addWorkspace).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'))
    })

    it('--json outputs curated workspace shape', async () => {
        mockApi.addWorkspace.mockResolvedValue({ id: 'ws-new', name: 'NewWS', plan: 'STARTER' })
        // After clearWorkspaceCache, the next fetch returns the new workspace
        // in the local (sync-derived) shape.
        mockFetchWorkspaces.mockResolvedValueOnce([
            ...mockWorkspaces,
            {
                id: 'ws-new',
                name: 'NewWS',
                role: 'ADMIN' as const,
                plan: 'STARTER',
                domainName: null,
                currentMemberCount: 1,
                currentActiveProjects: 0,
                memberCountByType: { adminCount: 1, memberCount: 0, guestCount: 0 },
            },
        ])
        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'create', '--name', 'NewWS', '--json'])

        const output = consoleSpy.mock.calls[0]?.[0] as string
        const parsed = JSON.parse(output)
        // Curated shape mirrors `workspace view --json` so create/view/update
        // all speak the same contract.
        expect(parsed).toEqual({
            id: 'ws-new',
            name: 'NewWS',
            plan: 'STARTER',
            role: 'ADMIN',
            domainName: null,
            memberCount: 1,
            projectCount: 0,
        })
    })

    it('shows help when --name is missing', async () => {
        const program = createProgram()
        // Commander .help() throws CommanderError under exitOverride; we just
        // verify addWorkspace was never called.
        await program.parseAsync(['node', 'td', 'workspace', 'create']).catch(() => undefined)
        expect(mockApi.addWorkspace).not.toHaveBeenCalled()
    })
})

describe('workspace update', () => {
    let mockApi: MockApi
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
        mockFetchWorkspaces.mockResolvedValue(mockWorkspaces)
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
        consoleSpy.mockRestore()
    })

    it('updates an admin-owned workspace', async () => {
        mockApi.updateWorkspace.mockResolvedValue({
            id: 'ws-2',
            name: 'Playground',
            description: 'hi',
        })
        const program = createProgram()
        await program.parseAsync([
            'node',
            'td',
            'workspace',
            'update',
            'Playground',
            '--description',
            'hi',
        ])

        expect(mockApi.updateWorkspace).toHaveBeenCalledWith('ws-2', { description: 'hi' })
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Updated: Playground'))
    })

    it('throws NOT_ADMIN for non-admin workspace (even on --dry-run)', async () => {
        const program = createProgram()
        await expect(
            program.parseAsync([
                'node',
                'td',
                'workspace',
                'update',
                'Doist',
                '--description',
                'hi',
                '--dry-run',
            ]),
        ).rejects.toThrow(/admin/i)
        expect(mockApi.updateWorkspace).not.toHaveBeenCalled()
    })

    it('throws NO_CHANGES when no update flags provided', async () => {
        const program = createProgram()
        await expect(
            program.parseAsync(['node', 'td', 'workspace', 'update', 'Playground']),
        ).rejects.toThrow(/No changes/i)
        expect(mockApi.updateWorkspace).not.toHaveBeenCalled()
    })

    it('NO_CHANGES wins over NOT_ADMIN when no flags are passed to a non-admin workspace', async () => {
        // A user who simply forgot their flags should see "no changes" rather
        // than a confusing NOT_ADMIN error about a mutation that was never
        // going to happen.
        const program = createProgram()
        await expect(
            program.parseAsync(['node', 'td', 'workspace', 'update', 'Doist']),
        ).rejects.toThrow(/No changes/i)
        expect(mockApi.updateWorkspace).not.toHaveBeenCalled()
    })

    it('--dry-run skips API when admin', async () => {
        const program = createProgram()
        await program.parseAsync([
            'node',
            'td',
            'workspace',
            'update',
            'Playground',
            '--name',
            'New',
            '--dry-run',
        ])
        expect(mockApi.updateWorkspace).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'))
    })

    it('--json outputs curated workspace shape', async () => {
        mockApi.updateWorkspace.mockResolvedValue({ id: 'ws-2', name: 'Renamed' })
        // First fetch = resolveWorkspaceRef (pre-update); second = post-update
        // refresh for the curated JSON output.
        mockFetchWorkspaces.mockReset()
        mockFetchWorkspaces
            .mockResolvedValueOnce(mockWorkspaces)
            .mockResolvedValueOnce([mockWorkspaces[0]!, { ...mockWorkspaces[1]!, name: 'Renamed' }])
        const program = createProgram()
        await program.parseAsync([
            'node',
            'td',
            'workspace',
            'update',
            'Playground',
            '--name',
            'Renamed',
            '--json',
        ])
        const output = consoleSpy.mock.calls[0]?.[0] as string
        expect(JSON.parse(output)).toEqual({
            id: 'ws-2',
            name: 'Renamed',
            plan: 'STARTER',
            role: 'ADMIN',
            domainName: null,
            memberCount: 2,
            projectCount: 5,
        })
    })
})

describe('workspace delete', () => {
    let mockApi: MockApi
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
        mockFetchWorkspaces.mockResolvedValue(mockWorkspaces)
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
        consoleSpy.mockRestore()
    })

    it('throws NOT_ADMIN on non-admin workspace (even on --dry-run)', async () => {
        const program = createProgram()
        await expect(
            program.parseAsync(['node', 'td', 'workspace', 'delete', 'Doist', '--dry-run']),
        ).rejects.toThrow(/admin/i)
        expect(mockApi.deleteWorkspace).not.toHaveBeenCalled()
    })

    it('requires --yes to actually delete', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'delete', 'Playground'])

        expect(mockApi.deleteWorkspace).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would delete'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('--yes'))
    })

    it('deletes when admin and --yes provided', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'delete', 'Playground', '--yes'])

        expect(mockApi.deleteWorkspace).toHaveBeenCalledWith('ws-2')
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Deleted: Playground'))
    })

    it('--dry-run on admin workspace prints preview without deleting', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'delete', 'Playground', '--dry-run'])
        expect(mockApi.deleteWorkspace).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'))
    })
})

describe('workspace user-tasks', () => {
    let mockApi: MockApi
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
        mockFetchWorkspaces.mockResolvedValue(mockWorkspaces)
        mockApi.getWorkspaceUsers.mockResolvedValue({
            workspaceUsers: [
                {
                    userId: 'u-1',
                    workspaceId: 'ws-1',
                    userEmail: 'alice@example.com',
                    fullName: 'Alice Example',
                    timezone: 'UTC',
                    role: 'MEMBER',
                    imageId: null,
                    isDeleted: false,
                },
            ],
            hasMore: false,
        })
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
        consoleSpy.mockRestore()
    })

    it('resolves user by email and calls API', async () => {
        mockApi.getWorkspaceUserTasks.mockResolvedValue({
            tasks: [
                {
                    id: 't-1',
                    content: 'Do thing',
                    responsibleUid: 'u-1',
                    due: null,
                    deadline: null,
                    labels: [],
                    notesCount: 0,
                    projectId: 'p-1',
                    projectName: 'Proj',
                    priority: 1,
                    description: '',
                    isOverdue: false,
                },
            ],
        })

        const program = createProgram()
        await program.parseAsync([
            'node',
            'td',
            'workspace',
            'user-tasks',
            'Doist',
            '--user',
            'alice@example.com',
        ])

        expect(mockApi.getWorkspaceUserTasks).toHaveBeenCalledWith({
            workspaceId: 'ws-1',
            userId: 'u-1',
            projectIds: undefined,
        })
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Do thing'))
    })

    it('errors when --user is missing', async () => {
        const program = createProgram()
        await expect(
            program.parseAsync(['node', 'td', 'workspace', 'user-tasks', 'Doist']),
        ).rejects.toThrow(/--user/i)
    })

    it('passes through --project-ids', async () => {
        mockApi.getWorkspaceUserTasks.mockResolvedValue({ tasks: [] })
        const program = createProgram()
        await program.parseAsync([
            'node',
            'td',
            'workspace',
            'user-tasks',
            'Doist',
            '--user',
            'alice@example.com',
            '--project-ids',
            'id:p-1,id:p-2',
        ])

        expect(mockApi.getWorkspaceUserTasks).toHaveBeenCalledWith({
            workspaceId: 'ws-1',
            userId: 'u-1',
            projectIds: 'p-1,p-2',
        })
    })

    it('--json outputs structured response', async () => {
        mockApi.getWorkspaceUserTasks.mockResolvedValue({
            tasks: [
                {
                    id: 't-1',
                    content: 'Do thing',
                    responsibleUid: 'u-1',
                    due: { date: '2026-05-01', isRecurring: false, string: 'may 1' },
                    deadline: null,
                    labels: [],
                    notesCount: 0,
                    projectId: 'p-1',
                    projectName: 'Proj',
                    priority: 1,
                    description: '',
                    isOverdue: true,
                },
            ],
        })

        const program = createProgram()
        await program.parseAsync([
            'node',
            'td',
            'workspace',
            'user-tasks',
            'Doist',
            '--user',
            'alice@example.com',
            '--json',
        ])

        const output = consoleSpy.mock.calls[0]?.[0] as string
        const parsed = JSON.parse(output)
        expect(parsed.results[0]).toMatchObject({ id: 't-1', isOverdue: true })
        // Collection shape matches other list/report commands.
        expect(parsed.nextCursor).toBeNull()
    })
})

describe('workspace activity', () => {
    let mockApi: MockApi
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
        mockFetchWorkspaces.mockResolvedValue(mockWorkspaces)
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
        consoleSpy.mockRestore()
    })

    it('calls API with workspace id and passes through filters', async () => {
        mockApi.getWorkspaceMembersActivity.mockResolvedValue({ members: [] })
        const program = createProgram()
        await program.parseAsync([
            'node',
            'td',
            'workspace',
            'activity',
            'Doist',
            '--user-ids',
            'u-1,u-2',
            '--project-ids',
            'id:p-1',
            '--json',
        ])

        expect(mockApi.getWorkspaceMembersActivity).toHaveBeenCalledWith({
            workspaceId: 'ws-1',
            userIds: 'u-1,u-2',
            projectIds: 'p-1',
        })
    })

    it('--json outputs structured response', async () => {
        mockApi.getWorkspaceMembersActivity.mockResolvedValue({
            members: [{ userId: 'u-1', tasksAssigned: 5, tasksOverdue: 1 }],
        })

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'activity', 'Doist', '--json'])

        const output = consoleSpy.mock.calls[0]?.[0] as string
        const parsed = JSON.parse(output)
        expect(parsed.results[0]).toMatchObject({ userId: 'u-1', tasksAssigned: 5 })
        expect(parsed.nextCursor).toBeNull()
    })
})

describe('workspace use (default workspace)', () => {
    let mockApi: MockApi
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
        mockFetchWorkspaces.mockResolvedValue(mockWorkspaces)
        mockFetchWorkspaceFolders.mockResolvedValue([])
        mockReadConfig.mockResolvedValue({})
        mockWriteConfig.mockResolvedValue(undefined)
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
        consoleSpy.mockRestore()
    })

    it('stores the resolved workspace id under workspace.defaultWorkspace', async () => {
        mockReadConfig.mockResolvedValue({ update_channel: 'stable' })

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'use', 'Doist'])

        expect(mockWriteConfig).toHaveBeenCalledWith({
            update_channel: 'stable',
            workspace: { defaultWorkspace: 'ws-1' },
        })
        const output = consoleSpy.mock.calls
            .map((c: unknown[]) => c.map(String).join(' '))
            .join('\n')
        expect(output).toContain('Default workspace set to')
        expect(output).toContain('Doist')
    })

    it('accepts id: prefix refs and stores the raw id', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'use', 'id:ws-2'])

        expect(mockWriteConfig).toHaveBeenCalledWith({
            workspace: { defaultWorkspace: 'ws-2' },
        })
    })

    it('--clear removes the stored default and drops the workspace object when empty', async () => {
        mockReadConfig.mockResolvedValue({
            update_channel: 'stable',
            workspace: { defaultWorkspace: 'ws-1' },
        })

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'use', '--clear'])

        expect(mockWriteConfig).toHaveBeenCalledWith({ update_channel: 'stable' })
    })

    it('--clear is a no-op and does not write when no default was set', async () => {
        mockReadConfig.mockResolvedValue({ update_channel: 'stable' })

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'use', '--clear'])

        expect(mockWriteConfig).not.toHaveBeenCalled()
    })

    it('uses the configured default when ref is omitted on a workspace subcommand', async () => {
        mockReadConfig.mockResolvedValue({
            workspace: { defaultWorkspace: 'ws-2' },
        })
        mockApi.getWorkspaceMembersActivity.mockResolvedValue({ members: [] })

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'activity', '--json'])

        expect(mockApi.getWorkspaceMembersActivity).toHaveBeenCalledWith(
            expect.objectContaining({ workspaceId: 'ws-2' }),
        )
    })

    it('prefers an explicit ref over the configured default', async () => {
        mockReadConfig.mockResolvedValue({
            workspace: { defaultWorkspace: 'ws-2' },
        })
        mockApi.getWorkspaceMembersActivity.mockResolvedValue({ members: [] })

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'workspace', 'activity', 'Doist', '--json'])

        expect(mockApi.getWorkspaceMembersActivity).toHaveBeenCalledWith(
            expect.objectContaining({ workspaceId: 'ws-1' }),
        )
    })

    it('throws WORKSPACE_REQUIRED when no ref and no default are set', async () => {
        const program = createProgram()
        await expect(
            program.parseAsync(['node', 'td', 'workspace', 'projects']),
        ).rejects.toMatchObject({
            code: 'WORKSPACE_REQUIRED',
            hints: expect.arrayContaining([expect.stringContaining('td workspace use')]),
        })
    })
})
