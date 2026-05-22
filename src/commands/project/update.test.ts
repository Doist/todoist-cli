import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/api/core.js', () => ({
    getApi: vi.fn(),
}))

vi.mock('../../lib/api/projects-sync.js', () => ({
    moveProjectParent: vi.fn().mockResolvedValue(undefined),
}))

import { moveProjectParent } from '../../lib/api/projects-sync.js'
import { setupApiMock } from '../../test-support/api-mock.js'
import { mockConsoleLog } from '../../test-support/console-spy.js'
import { type MockApi } from '../../test-support/mock-api.js'
import { createTestProgram } from '../../test-support/program.js'
import { registerProjectCommand } from './index.js'

const mockMoveProjectParent = vi.mocked(moveProjectParent)

function createProgram() {
    return createTestProgram(registerProjectCommand)
}

describe('project update', () => {
    let mockApi: MockApi
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
        consoleSpy = mockConsoleLog()
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

    it('moves project into folder by id', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({
            id: 'proj-1',
            name: 'Roadmap',
            workspaceId: '12345',
        })
        mockApi.getFolder.mockResolvedValue({
            id: 'folder-1',
            name: 'Engineering',
            workspaceId: '12345',
        })
        mockApi.updateProject.mockResolvedValue({ id: 'proj-1', name: 'Roadmap' })

        await program.parseAsync([
            'node',
            'td',
            'project',
            'update',
            'id:proj-1',
            '--folder',
            'id:folder-1',
        ])

        expect(mockApi.updateProject).toHaveBeenCalledWith('proj-1', {
            folderId: 'folder-1',
        })
    })

    it('removes project from folder with --no-folder', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({
            id: 'proj-1',
            name: 'Roadmap',
            workspaceId: '12345',
        })
        mockApi.updateProject.mockResolvedValue({ id: 'proj-1', name: 'Roadmap' })

        await program.parseAsync(['node', 'td', 'project', 'update', 'id:proj-1', '--no-folder'])

        expect(mockApi.updateProject).toHaveBeenCalledWith('proj-1', {
            folderId: null,
        })
    })

    it('rejects --folder on personal projects', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({ id: 'proj-1', name: 'Personal Project' })

        await expect(
            program.parseAsync([
                'node',
                'td',
                'project',
                'update',
                'id:proj-1',
                '--folder',
                'id:folder-1',
            ]),
        ).rejects.toThrow('--folder can only be used on workspace projects')
    })
})

describe('project update --json', () => {
    let mockApi: MockApi
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
        consoleSpy = mockConsoleLog()
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

describe('project update --parent / --no-parent', () => {
    let mockApi: MockApi
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
        consoleSpy = mockConsoleLog()
    })

    it('re-parents under another personal project (sync only, no updateProject)', async () => {
        const program = createProgram()

        mockApi.getProject
            .mockResolvedValueOnce({ id: 'p-1', name: 'Child', parentId: null })
            .mockResolvedValueOnce({ id: 'p-2', name: 'NewParent', parentId: null })

        await program.parseAsync([
            'node',
            'td',
            'project',
            'update',
            'id:p-1',
            '--parent',
            'id:p-2',
        ])

        expect(mockMoveProjectParent).toHaveBeenCalledWith('p-1', 'p-2')
        expect(mockApi.updateProject).not.toHaveBeenCalled()
    })

    it('moves to top level with --no-parent', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({ id: 'p-1', name: 'Child', parentId: 'p-parent' })

        await program.parseAsync(['node', 'td', 'project', 'update', 'id:p-1', '--no-parent'])

        expect(mockMoveProjectParent).toHaveBeenCalledWith('p-1', null)
        expect(mockApi.updateProject).not.toHaveBeenCalled()
    })

    it('runs updateProject before moveProjectParent when both fields change', async () => {
        const program = createProgram()

        mockApi.getProject
            .mockResolvedValueOnce({ id: 'p-1', name: 'Child', parentId: null })
            .mockResolvedValueOnce({ id: 'p-2', name: 'NewParent', parentId: null })
        mockApi.updateProject.mockResolvedValue({ id: 'p-1', name: 'Renamed' })

        await program.parseAsync([
            'node',
            'td',
            'project',
            'update',
            'id:p-1',
            '--name',
            'Renamed',
            '--parent',
            'id:p-2',
        ])

        expect(mockApi.updateProject).toHaveBeenCalledWith('p-1', { name: 'Renamed' })
        expect(mockMoveProjectParent).toHaveBeenCalledWith('p-1', 'p-2')
        const updateOrder = mockApi.updateProject.mock.invocationCallOrder[0]
        const moveOrder = mockMoveProjectParent.mock.invocationCallOrder[0]
        expect(updateOrder).toBeLessThan(moveOrder)
    })

    it('rejects --parent on workspace projects', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({
            id: 'p-1',
            name: 'Workspace Project',
            workspaceId: 'w-1',
        })

        await expect(
            program.parseAsync(['node', 'td', 'project', 'update', 'id:p-1', '--parent', 'id:p-2']),
        ).rejects.toHaveProperty('code', 'WORKSPACE_NO_SUBPROJECTS')
    })

    it('rejects workspace project used as parent', async () => {
        const program = createProgram()

        mockApi.getProject
            .mockResolvedValueOnce({ id: 'p-1', name: 'Child', parentId: null })
            .mockResolvedValueOnce({
                id: 'p-2',
                name: 'Workspace Parent',
                workspaceId: 'w-1',
            })

        await expect(
            program.parseAsync(['node', 'td', 'project', 'update', 'id:p-1', '--parent', 'id:p-2']),
        ).rejects.toHaveProperty('code', 'WORKSPACE_NO_SUBPROJECTS')
    })

    it('rejects self-parent', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({ id: 'p-1', name: 'Self', parentId: null })

        await expect(
            program.parseAsync(['node', 'td', 'project', 'update', 'id:p-1', '--parent', 'id:p-1']),
        ).rejects.toHaveProperty('code', 'INVALID_OPTIONS')
    })

    it('--dry-run with --parent does not call API', async () => {
        const program = createProgram()

        mockApi.getProject
            .mockResolvedValueOnce({ id: 'p-1', name: 'Child', parentId: null })
            .mockResolvedValueOnce({ id: 'p-2', name: 'NewParent', parentId: null })

        await program.parseAsync([
            'node',
            'td',
            'project',
            'update',
            'id:p-1',
            '--parent',
            'id:p-2',
            '--dry-run',
        ])

        expect(mockMoveProjectParent).not.toHaveBeenCalled()
        expect(mockApi.updateProject).not.toHaveBeenCalled()
    })

    it('rejects re-parenting to a descendant (cycle prevention)', async () => {
        const program = createProgram()
        // Tree: A (parent=null) > B (parent=A). Attempting `update A --parent B`
        // must reject — B is a descendant of A.
        const a = { id: 'p-A', name: 'A', parentId: null, childOrder: 1 }
        const b = { id: 'p-B', name: 'B', parentId: 'p-A', childOrder: 1 }
        mockApi.getProject.mockResolvedValueOnce(a).mockResolvedValueOnce(b)
        mockApi.getProjects.mockResolvedValue({ results: [a, b], nextCursor: null })

        await expect(
            program.parseAsync(['node', 'td', 'project', 'update', 'id:p-A', '--parent', 'id:p-B']),
        ).rejects.toHaveProperty('code', 'INVALID_OPTIONS')
        expect(mockMoveProjectParent).not.toHaveBeenCalled()
    })

    it('skips the move when --parent matches the current parent', async () => {
        const program = createProgram()
        mockApi.getProject
            .mockResolvedValueOnce({ id: 'p-1', name: 'Child', parentId: 'p-2' })
            .mockResolvedValueOnce({ id: 'p-2', name: 'Parent', parentId: null })

        await expect(
            program.parseAsync(['node', 'td', 'project', 'update', 'id:p-1', '--parent', 'id:p-2']),
        ).rejects.toHaveProperty('code', 'NO_CHANGES')
        expect(mockMoveProjectParent).not.toHaveBeenCalled()
    })

    it('skips the move when --no-parent is given on an already top-level project', async () => {
        const program = createProgram()
        mockApi.getProject.mockResolvedValue({ id: 'p-1', name: 'Top', parentId: null })

        await expect(
            program.parseAsync(['node', 'td', 'project', 'update', 'id:p-1', '--no-parent']),
        ).rejects.toHaveProperty('code', 'NO_CHANGES')
        expect(mockMoveProjectParent).not.toHaveBeenCalled()
    })

    it('--parent --json refetches and emits the refreshed project as JSON', async () => {
        const program = createProgram()
        mockApi.getProject
            .mockResolvedValueOnce({ id: 'p-1', name: 'Child', parentId: null })
            .mockResolvedValueOnce({ id: 'p-2', name: 'NewParent', parentId: null })
            .mockResolvedValueOnce({ id: 'p-1', name: 'Child', parentId: 'p-2' })

        await program.parseAsync([
            'node',
            'td',
            'project',
            'update',
            'id:p-1',
            '--parent',
            'id:p-2',
            '--json',
        ])

        expect(mockMoveProjectParent).toHaveBeenCalledWith('p-1', 'p-2')
        const output = consoleSpy.mock.calls[0][0] as string
        const parsed = JSON.parse(output)
        expect(parsed.id).toBe('p-1')
        expect(parsed.parentId).toBe('p-2')
        expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Updated:'))
    })
})
