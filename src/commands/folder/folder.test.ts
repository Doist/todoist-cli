import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/api/core.js', () => ({
    getApi: vi.fn(),
}))

vi.mock('../../lib/api/workspaces.js', () => ({
    fetchWorkspaces: vi.fn(),
    fetchWorkspaceFolders: vi.fn(),
}))

import { registerFolderCommand } from './index.js'
import { getApi } from '../../lib/api/core.js'
import { fetchWorkspaceFolders, fetchWorkspaces } from '../../lib/api/workspaces.js'
import { createMockApi, type MockApi } from '../../test-support/mock-api.js'

const mockGetApi = vi.mocked(getApi)
const mockFetchWorkspaces = vi.mocked(fetchWorkspaces)
const mockFetchWorkspaceFolders = vi.mocked(fetchWorkspaceFolders)

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerFolderCommand(program)
    return program
}

const mockWorkspace = {
    id: '12345',
    name: 'Acme',
    role: 'ADMIN' as const,
    plan: 'BUSINESS',
    domainName: 'acme.com',
    currentMemberCount: 10,
    currentActiveProjects: 5,
    memberCountByType: { adminCount: 1, memberCount: 8, guestCount: 1 },
}

const mockFolder = {
    id: 'folder-1',
    name: 'Engineering',
    workspaceId: '12345',
    isDeleted: false,
    defaultOrder: 0,
    childOrder: 1,
}

describe('folder list', () => {
    let mockApi: MockApi
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
        mockFetchWorkspaces.mockResolvedValue([mockWorkspace])
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    it('lists folders for a workspace', async () => {
        const program = createProgram()
        mockApi.getFolders.mockResolvedValue({
            results: [mockFolder, { ...mockFolder, id: 'folder-2', name: 'Design' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'folder', 'list', 'Acme'])

        expect(mockApi.getFolders).toHaveBeenCalledWith(
            expect.objectContaining({ workspaceId: '12345' }),
        )
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Engineering'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Design'))
        consoleSpy.mockRestore()
    })

    it('shows "No folders found." when empty', async () => {
        const program = createProgram()
        mockApi.getFolders.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'folder', 'list', 'Acme'])

        expect(consoleSpy).toHaveBeenCalledWith('No folders found.')
        consoleSpy.mockRestore()
    })

    it('outputs JSON with --json flag', async () => {
        const program = createProgram()
        mockApi.getFolders.mockResolvedValue({
            results: [mockFolder],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'folder', 'list', 'Acme', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.results).toBeDefined()
        expect(parsed.results[0].name).toBe('Engineering')
        consoleSpy.mockRestore()
    })

    it('accepts --workspace flag instead of positional arg', async () => {
        const program = createProgram()
        mockApi.getFolders.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'folder', 'list', '--workspace', 'Acme'])

        expect(mockApi.getFolders).toHaveBeenCalled()
        consoleSpy.mockRestore()
    })

    it('errors when both positional and --workspace are provided', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'td', 'folder', 'list', 'Acme', '--workspace', 'Other']),
        ).rejects.toThrow('Cannot specify workspace both as argument and --workspace flag')
    })
})

describe('folder create', () => {
    let mockApi: MockApi
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
        mockFetchWorkspaces.mockResolvedValue([mockWorkspace])
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    it('creates folder in workspace', async () => {
        const program = createProgram()
        mockApi.addFolder.mockResolvedValue(mockFolder)

        await program.parseAsync([
            'node',
            'td',
            'folder',
            'create',
            'Acme',
            '--name',
            'Engineering',
        ])

        expect(mockApi.addFolder).toHaveBeenCalledWith({
            name: 'Engineering',
            workspaceId: '12345',
            defaultOrder: undefined,
            childOrder: undefined,
        })
        expect(consoleSpy).toHaveBeenCalledWith('Created: Engineering')
        consoleSpy.mockRestore()
    })

    it('shows folder ID after creation', async () => {
        const program = createProgram()
        mockApi.addFolder.mockResolvedValue(mockFolder)

        await program.parseAsync([
            'node',
            'td',
            'folder',
            'create',
            'Acme',
            '--name',
            'Engineering',
        ])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('folder-1'))
        consoleSpy.mockRestore()
    })

    it('outputs created folder as JSON with --json', async () => {
        const program = createProgram()
        mockApi.addFolder.mockResolvedValue(mockFolder)

        await program.parseAsync([
            'node',
            'td',
            'folder',
            'create',
            'Acme',
            '--name',
            'Engineering',
            '--json',
        ])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.id).toBe('folder-1')
        expect(parsed.name).toBe('Engineering')
        consoleSpy.mockRestore()
    })

    it('shows dry-run preview with --dry-run', async () => {
        const program = createProgram()

        await program.parseAsync([
            'node',
            'td',
            'folder',
            'create',
            'Acme',
            '--name',
            'Engineering',
            '--dry-run',
        ])

        expect(mockApi.addFolder).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would create folder'))
        consoleSpy.mockRestore()
    })
})

describe('folder update', () => {
    let mockApi: MockApi
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
        mockFetchWorkspaces.mockResolvedValue([mockWorkspace])
        mockFetchWorkspaceFolders.mockResolvedValue([
            { id: 'folder-1', name: 'Engineering', workspaceId: '12345' },
        ])
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    it('updates folder name by id:xxx', async () => {
        const program = createProgram()
        mockApi.getFolder.mockResolvedValue(mockFolder)
        mockApi.updateFolder.mockResolvedValue({ ...mockFolder, name: 'Platform' })

        await program.parseAsync([
            'node',
            'td',
            'folder',
            'update',
            'id:folder-1',
            '--name',
            'Platform',
        ])

        expect(mockApi.updateFolder).toHaveBeenCalledWith('folder-1', { name: 'Platform' })
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Engineering → Platform'))
        consoleSpy.mockRestore()
    })

    it('outputs updated folder as JSON with --json', async () => {
        const program = createProgram()
        mockApi.getFolder.mockResolvedValue(mockFolder)
        mockApi.updateFolder.mockResolvedValue({ ...mockFolder, name: 'Platform' })

        await program.parseAsync([
            'node',
            'td',
            'folder',
            'update',
            'id:folder-1',
            '--name',
            'Platform',
            '--json',
        ])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.name).toBe('Platform')
        consoleSpy.mockRestore()
    })

    it('errors with NO_CHANGES when no update flags provided', async () => {
        const program = createProgram()
        mockApi.getFolder.mockResolvedValue(mockFolder)

        await expect(
            program.parseAsync(['node', 'td', 'folder', 'update', 'id:folder-1']),
        ).rejects.toHaveProperty('code', 'NO_CHANGES')
    })

    it('shows dry-run preview with --dry-run', async () => {
        const program = createProgram()
        mockApi.getFolder.mockResolvedValue(mockFolder)

        await program.parseAsync([
            'node',
            'td',
            'folder',
            'update',
            'id:folder-1',
            '--name',
            'Platform',
            '--dry-run',
        ])

        expect(mockApi.updateFolder).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would update folder'))
        consoleSpy.mockRestore()
    })
})

describe('folder delete', () => {
    let mockApi: MockApi
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
        mockFetchWorkspaces.mockResolvedValue([mockWorkspace])
        mockFetchWorkspaceFolders.mockResolvedValue([
            { id: 'folder-1', name: 'Engineering', workspaceId: '12345' },
        ])
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    it('shows confirmation prompt without --yes', async () => {
        const program = createProgram()
        mockApi.getFolder.mockResolvedValue(mockFolder)

        await program.parseAsync(['node', 'td', 'folder', 'delete', 'id:folder-1'])

        expect(mockApi.deleteFolder).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith('Would delete folder: Engineering')
        expect(consoleSpy).toHaveBeenCalledWith('Use --yes to confirm.')
        consoleSpy.mockRestore()
    })

    it('deletes folder with --yes', async () => {
        const program = createProgram()
        mockApi.getFolder.mockResolvedValue(mockFolder)
        mockApi.deleteFolder.mockResolvedValue(true)

        await program.parseAsync(['node', 'td', 'folder', 'delete', 'id:folder-1', '--yes'])

        expect(mockApi.deleteFolder).toHaveBeenCalledWith('folder-1')
        expect(consoleSpy).toHaveBeenCalledWith('Deleted: Engineering (id:folder-1)')
        consoleSpy.mockRestore()
    })

    it('shows dry-run preview with --dry-run', async () => {
        const program = createProgram()
        mockApi.getFolder.mockResolvedValue(mockFolder)

        await program.parseAsync(['node', 'td', 'folder', 'delete', 'id:folder-1', '--dry-run'])

        expect(mockApi.deleteFolder).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would delete folder'))
        consoleSpy.mockRestore()
    })
})

describe('folder view', () => {
    let mockApi: MockApi
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
        mockFetchWorkspaces.mockResolvedValue([mockWorkspace])
        mockFetchWorkspaceFolders.mockResolvedValue([
            { id: 'folder-1', name: 'Engineering', workspaceId: '12345' },
        ])
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    it('shows folder details and contained projects', async () => {
        const program = createProgram()
        mockApi.getFolder.mockResolvedValue(mockFolder)
        mockApi.getProjects.mockResolvedValue({
            results: [
                {
                    id: 'proj-1',
                    name: 'Backend',
                    workspaceId: '12345',
                    folderId: 'folder-1',
                },
                {
                    id: 'proj-2',
                    name: 'Frontend',
                    workspaceId: '12345',
                    folderId: 'folder-1',
                },
                {
                    id: 'proj-3',
                    name: 'Other',
                    workspaceId: '12345',
                    folderId: 'folder-2',
                },
            ],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'folder', 'view', 'id:folder-1'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Engineering'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Backend'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Frontend'))
        consoleSpy.mockRestore()
    })

    it('shows "No projects in this folder." when empty', async () => {
        const program = createProgram()
        mockApi.getFolder.mockResolvedValue(mockFolder)
        mockApi.getProjects.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'folder', 'view', 'id:folder-1'])

        expect(consoleSpy).toHaveBeenCalledWith('No projects in this folder.')
        consoleSpy.mockRestore()
    })

    it('outputs JSON with --json flag', async () => {
        const program = createProgram()
        mockApi.getFolder.mockResolvedValue(mockFolder)
        mockApi.getProjects.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'folder', 'view', 'id:folder-1', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.folder).toBeDefined()
        expect(parsed.folder.id).toBe('folder-1')
        expect(parsed.projects).toBeDefined()
        consoleSpy.mockRestore()
    })
})

describe('folder workspace auto-detection', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
        mockFetchWorkspaceFolders.mockResolvedValue([
            { id: 'folder-1', name: 'Engineering', workspaceId: '12345' },
        ])
    })

    it('auto-detects single workspace for folder resolution', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        mockFetchWorkspaces.mockResolvedValue([mockWorkspace])
        mockApi.getFolder.mockResolvedValue(mockFolder)
        mockApi.getProjects.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'folder', 'view', 'Engineering'])

        expect(mockApi.getFolder).toHaveBeenCalledWith('folder-1')
        consoleSpy.mockRestore()
    })

    it('errors when multiple workspaces and no --workspace', async () => {
        const program = createProgram()
        const secondWorkspace = { ...mockWorkspace, id: '67890', name: 'Other' }
        mockFetchWorkspaces.mockResolvedValue([mockWorkspace, secondWorkspace])

        await expect(
            program.parseAsync(['node', 'td', 'folder', 'view', 'Engineering']),
        ).rejects.toThrow('Multiple workspaces found')
    })
})
