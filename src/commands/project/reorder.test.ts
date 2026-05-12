import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/api/core.js', () => ({
    getApi: vi.fn(),
}))

vi.mock('../../lib/api/projects-sync.js', () => ({
    moveProjectParent: vi.fn().mockResolvedValue(undefined),
    reorderProjects: vi.fn().mockResolvedValue(undefined),
}))

import { getApi } from '../../lib/api/core.js'
import { reorderProjects } from '../../lib/api/projects-sync.js'
import { createMockApi, type MockApi } from '../../test-support/mock-api.js'
import { registerProjectCommand } from './index.js'

const mockGetApi = vi.mocked(getApi)
const mockReorderProjects = vi.mocked(reorderProjects)

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerProjectCommand(program)
    return program
}

describe('project reorder', () => {
    let mockApi: MockApi
    let consoleSpy: ReturnType<typeof vi.spyOn>

    const siblings = [
        { id: 'p-1', name: 'Alpha', parentId: null, childOrder: 1 },
        { id: 'p-2', name: 'Bravo', parentId: null, childOrder: 2 },
        { id: 'p-3', name: 'Charlie', parentId: null, childOrder: 3 },
        { id: 'p-4', name: 'Delta', parentId: null, childOrder: 4 },
    ]

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
        consoleSpy.mockRestore()
    })

    function primeProjects(target: (typeof siblings)[number]) {
        mockApi.getProject.mockResolvedValue(target)
        mockApi.getProjects.mockResolvedValue({ results: siblings, nextCursor: null })
    }

    it('throws when no flag is provided', async () => {
        const program = createProgram()
        primeProjects(siblings[0])

        await expect(
            program.parseAsync(['node', 'td', 'project', 'reorder', 'id:p-1']),
        ).rejects.toHaveProperty('code', 'INVALID_OPTIONS')
    })

    it('throws when more than one flag is provided', async () => {
        const program = createProgram()
        primeProjects(siblings[0])

        await expect(
            program.parseAsync([
                'node',
                'td',
                'project',
                'reorder',
                'id:p-1',
                '--before',
                'id:p-2',
                '--position',
                '0',
            ]),
        ).rejects.toHaveProperty('code', 'INVALID_OPTIONS')
    })

    it('--position 0 moves target to first', async () => {
        const program = createProgram()
        mockApi.getProject.mockResolvedValueOnce(siblings[2])
        mockApi.getProjects.mockResolvedValue({ results: siblings, nextCursor: null })

        await program.parseAsync(['node', 'td', 'project', 'reorder', 'id:p-3', '--position', '0'])

        expect(mockReorderProjects).toHaveBeenCalledWith([
            { id: 'p-3', childOrder: 1 },
            { id: 'p-1', childOrder: 2 },
            { id: 'p-2', childOrder: 3 },
            { id: 'p-4', childOrder: 4 },
        ])
    })

    it('--position clamps to last when out of range', async () => {
        const program = createProgram()
        mockApi.getProject.mockResolvedValueOnce(siblings[0])
        mockApi.getProjects.mockResolvedValue({ results: siblings, nextCursor: null })

        await program.parseAsync([
            'node',
            'td',
            'project',
            'reorder',
            'id:p-1',
            '--position',
            '999',
        ])

        expect(mockReorderProjects).toHaveBeenCalledWith([
            { id: 'p-2', childOrder: 1 },
            { id: 'p-3', childOrder: 2 },
            { id: 'p-4', childOrder: 3 },
            { id: 'p-1', childOrder: 4 },
        ])
    })

    it('--before places target immediately before sibling', async () => {
        const program = createProgram()
        mockApi.getProject.mockResolvedValueOnce(siblings[3]).mockResolvedValueOnce(siblings[1])
        mockApi.getProjects.mockResolvedValue({ results: siblings, nextCursor: null })

        await program.parseAsync([
            'node',
            'td',
            'project',
            'reorder',
            'id:p-4',
            '--before',
            'id:p-2',
        ])

        expect(mockReorderProjects).toHaveBeenCalledWith([
            { id: 'p-1', childOrder: 1 },
            { id: 'p-4', childOrder: 2 },
            { id: 'p-2', childOrder: 3 },
            { id: 'p-3', childOrder: 4 },
        ])
    })

    it('--after places target immediately after sibling', async () => {
        const program = createProgram()
        mockApi.getProject.mockResolvedValueOnce(siblings[0]).mockResolvedValueOnce(siblings[2])
        mockApi.getProjects.mockResolvedValue({ results: siblings, nextCursor: null })

        await program.parseAsync([
            'node',
            'td',
            'project',
            'reorder',
            'id:p-1',
            '--after',
            'id:p-3',
        ])

        expect(mockReorderProjects).toHaveBeenCalledWith([
            { id: 'p-2', childOrder: 1 },
            { id: 'p-3', childOrder: 2 },
            { id: 'p-1', childOrder: 3 },
            { id: 'p-4', childOrder: 4 },
        ])
    })

    it('rejects --before with a non-sibling', async () => {
        const program = createProgram()
        mockApi.getProject.mockResolvedValueOnce(siblings[0]).mockResolvedValueOnce({
            id: 'p-other',
            name: 'Other',
            parentId: 'p-elsewhere',
            childOrder: 1,
        })
        mockApi.getProjects.mockResolvedValue({ results: siblings, nextCursor: null })

        await expect(
            program.parseAsync([
                'node',
                'td',
                'project',
                'reorder',
                'id:p-1',
                '--before',
                'id:p-other',
            ]),
        ).rejects.toHaveProperty('code', 'NOT_SIBLINGS')
    })

    it('rejects --before relative to self', async () => {
        const program = createProgram()
        mockApi.getProject.mockResolvedValueOnce(siblings[0]).mockResolvedValueOnce(siblings[0])
        mockApi.getProjects.mockResolvedValue({ results: siblings, nextCursor: null })

        await expect(
            program.parseAsync([
                'node',
                'td',
                'project',
                'reorder',
                'id:p-1',
                '--before',
                'id:p-1',
            ]),
        ).rejects.toHaveProperty('code', 'INVALID_OPTIONS')
    })

    it('rejects reorder on workspace projects', async () => {
        const program = createProgram()
        mockApi.getProject.mockResolvedValue({
            id: 'wp-1',
            name: 'Workspace Project',
            workspaceId: 'w-1',
            childOrder: 1,
        })

        await expect(
            program.parseAsync(['node', 'td', 'project', 'reorder', 'id:wp-1', '--position', '0']),
        ).rejects.toHaveProperty('code', 'WORKSPACE_REORDER_UNSUPPORTED')
    })

    it('--dry-run does not call reorderProjects', async () => {
        const program = createProgram()
        mockApi.getProject.mockResolvedValueOnce(siblings[0])
        mockApi.getProjects.mockResolvedValue({ results: siblings, nextCursor: null })

        await program.parseAsync([
            'node',
            'td',
            'project',
            'reorder',
            'id:p-1',
            '--position',
            '2',
            '--dry-run',
        ])

        expect(mockReorderProjects).not.toHaveBeenCalled()
    })

    it('no-op when target already at requested position', async () => {
        const program = createProgram()
        mockApi.getProject.mockResolvedValueOnce(siblings[1])
        mockApi.getProjects.mockResolvedValue({ results: siblings, nextCursor: null })

        await program.parseAsync(['node', 'td', 'project', 'reorder', 'id:p-2', '--position', '1'])

        expect(mockReorderProjects).not.toHaveBeenCalled()
    })
})
