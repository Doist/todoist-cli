import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api/core.js', () => ({
    getApi: vi.fn(),
    isWorkspaceProject: vi.fn(
        (project: { workspaceId?: string }) => project.workspaceId !== undefined,
    ),
    isPersonalProject: vi.fn(
        (project: { workspaceId?: string }) => project.workspaceId === undefined,
    ),
}))

vi.mock('../lib/api/workspaces.js', () => ({
    fetchWorkspaces: vi.fn().mockResolvedValue([]),
    fetchWorkspaceFolders: vi.fn().mockResolvedValue([]),
}))

vi.mock('../lib/browser.js', () => ({
    openInBrowser: vi.fn(),
}))

import { registerProjectCommand } from '../commands/project.js'
import { getApi } from '../lib/api/core.js'
import { fetchWorkspaceFolders, fetchWorkspaces, type Workspace } from '../lib/api/workspaces.js'
import { openInBrowser } from '../lib/browser.js'

const mockOpenInBrowser = vi.mocked(openInBrowser)

const mockFetchWorkspaces = vi.mocked(fetchWorkspaces)
const mockFetchWorkspaceFolders = vi.mocked(fetchWorkspaceFolders)

const mockGetApi = vi.mocked(getApi)

function createMockApi() {
    return {
        getProjects: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        getProject: vi.fn(),
        getTasks: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        deleteProject: vi.fn(),
        addProject: vi.fn(),
        updateProject: vi.fn(),
        archiveProject: vi.fn(),
        unarchiveProject: vi.fn(),
        moveProjectToWorkspace: vi.fn(),
        moveProjectToPersonal: vi.fn(),
    }
}

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerProjectCommand(program)
    return program
}

describe('project list', () => {
    let mockApi: ReturnType<typeof createMockApi>
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
})

describe('project view', () => {
    let mockApi: ReturnType<typeof createMockApi>
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
    let mockApi: ReturnType<typeof createMockApi>
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
    let mockApi: ReturnType<typeof createMockApi> & {
        getWorkspaceUsers: ReturnType<typeof vi.fn>
        getProjectCollaborators: ReturnType<typeof vi.fn>
    }
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = {
            ...createMockApi(),
            getWorkspaceUsers: vi.fn(),
            getProjectCollaborators: vi.fn(),
        }
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
})

describe('project delete', () => {
    let mockApi: ReturnType<typeof createMockApi>

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
        expect(consoleSpy).toHaveBeenCalledWith('Deleted project: Test Project')
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
    let mockApi: ReturnType<typeof createMockApi>
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
        ).rejects.toThrow('WORKSPACE_NO_SUBPROJECTS')
    })

    it('shows project ID after creation', async () => {
        const program = createProgram()

        mockApi.addProject.mockResolvedValue({ id: 'proj-xyz', name: 'Test' })

        await program.parseAsync(['node', 'td', 'project', 'create', '--name', 'Test'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('proj-xyz'))
    })
})

describe('project update', () => {
    let mockApi: ReturnType<typeof createMockApi>
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
        expect(consoleSpy).toHaveBeenCalledWith('Updated: New Name')
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
        ).rejects.toThrow('NO_CHANGES')
    })
})

describe('project archive', () => {
    let mockApi: ReturnType<typeof createMockApi>
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
            results: [{ id: 'proj-1', name: 'My Project' }],
            nextCursor: null,
        })
        mockApi.archiveProject.mockResolvedValue({
            id: 'proj-1',
            name: 'My Project',
        })

        await program.parseAsync(['node', 'td', 'project', 'archive', 'My Project'])

        expect(mockApi.archiveProject).toHaveBeenCalledWith('proj-1')
        expect(consoleSpy).toHaveBeenCalledWith('Archived: My Project')
    })

    it('archives project by id: prefix', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({ id: 'proj-1', name: 'My Project' })
        mockApi.archiveProject.mockResolvedValue({
            id: 'proj-1',
            name: 'My Project',
        })

        await program.parseAsync(['node', 'td', 'project', 'archive', 'id:proj-1'])

        expect(mockApi.archiveProject).toHaveBeenCalledWith('proj-1')
    })
})

describe('project unarchive', () => {
    let mockApi: ReturnType<typeof createMockApi>
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
            results: [{ id: 'proj-1', name: 'My Project' }],
            nextCursor: null,
        })
        mockApi.unarchiveProject.mockResolvedValue({
            id: 'proj-1',
            name: 'My Project',
        })

        await program.parseAsync(['node', 'td', 'project', 'unarchive', 'My Project'])

        expect(mockApi.unarchiveProject).toHaveBeenCalledWith('proj-1')
        expect(consoleSpy).toHaveBeenCalledWith('Unarchived: My Project')
    })

    it('unarchives project by id: prefix', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({ id: 'proj-1', name: 'My Project' })
        mockApi.unarchiveProject.mockResolvedValue({
            id: 'proj-1',
            name: 'My Project',
        })

        await program.parseAsync(['node', 'td', 'project', 'unarchive', 'id:proj-1'])

        expect(mockApi.unarchiveProject).toHaveBeenCalledWith('proj-1')
    })
})

describe('project browse', () => {
    let mockApi: ReturnType<typeof createMockApi>
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
    let mockApi: ReturnType<typeof createMockApi>
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
        ).rejects.toThrow('MISSING_DESTINATION')
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
        ).rejects.toThrow('INVALID_OPTIONS')
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
        ).rejects.toThrow('INVALID_OPTIONS')
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
        ).rejects.toThrow('INVALID_OPTIONS')
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
        ).rejects.toThrow('INVALID_VISIBILITY')
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
        ])

        expect(mockApi.moveProjectToWorkspace).toHaveBeenCalledWith({
            projectId: 'proj-1',
            workspaceId: 'ws-1',
        })
        expect(consoleSpy).toHaveBeenCalledWith('Moved "My Project" to workspace "Acme Corp"')
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
            'Engineering',
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

        await program.parseAsync(['node', 'td', 'project', 'move', 'id:proj-ws-1', '--to-personal'])

        expect(mockApi.moveProjectToPersonal).toHaveBeenCalledWith({
            projectId: 'proj-ws-1',
        })
        expect(consoleSpy).toHaveBeenCalledWith('Moved "Team Project" to personal')
    })

    it('errors when moving personal project --to-personal', async () => {
        const program = createProgram()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'My Project' }],
            nextCursor: null,
        })

        await expect(
            program.parseAsync(['node', 'td', 'project', 'move', 'My Project', '--to-personal']),
        ).rejects.toThrow('ALREADY_PERSONAL')
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
        ).rejects.toThrow('SAME_WORKSPACE')
    })
})
