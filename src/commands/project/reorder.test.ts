import { captureConsole, createTestProgram } from '@doist/cli-core/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/api/core.js', () => ({
    getApi: vi.fn(),
}))

vi.mock('../../lib/api/projects-sync.js', () => ({
    moveProjectParent: vi.fn().mockResolvedValue(undefined),
    reorderProjects: vi.fn().mockResolvedValue(undefined),
}))

import { reorderProjects } from '../../lib/api/projects-sync.js'
import { setupApiMock } from '../../test-support/api-mock.js'
import { type MockApi } from '../../test-support/mock-api.js'
import { registerProjectCommand } from './index.js'

const mockReorderProjects = vi.mocked(reorderProjects)

function createProgram() {
    return createTestProgram(registerProjectCommand)
}

describe('project reorder', () => {
    let mockApi: MockApi
    let consoleSpy: ReturnType<typeof vi.spyOn>

    type FakeProject = {
        id: string
        name: string
        parentId: string | null
        childOrder: number
    }
    const siblings: FakeProject[] = [
        { id: 'p-1', name: 'Alpha', parentId: null, childOrder: 1 },
        { id: 'p-2', name: 'Bravo', parentId: null, childOrder: 2 },
        { id: 'p-3', name: 'Charlie', parentId: null, childOrder: 3 },
        { id: 'p-4', name: 'Delta', parentId: null, childOrder: 4 },
    ]

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
        consoleSpy = captureConsole()
    })

    function primeProjects(target: (typeof siblings)[number], all = siblings) {
        mockApi.getProject.mockResolvedValue(target)
        mockApi.getProjects.mockResolvedValue({ results: all, nextCursor: null })
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

    it('rejects non-integer --position values', async () => {
        const program = createProgram()
        primeProjects(siblings[0])

        await expect(
            program.parseAsync(['node', 'td', 'project', 'reorder', 'id:p-1', '--position', '1.5']),
        ).rejects.toHaveProperty('code', 'INVALID_ORDER')
    })

    it('--position 0 moves target to first', async () => {
        const program = createProgram()
        primeProjects(siblings[2])

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
        primeProjects(siblings[0])

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
        primeProjects(siblings[3])

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
        primeProjects(siblings[0])

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
        const other = { id: 'p-other', name: 'Other', parentId: 'p-elsewhere', childOrder: 1 }
        primeProjects(siblings[0], [...siblings, other])

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
        primeProjects(siblings[0])

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
        primeProjects(siblings[0])

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
        primeProjects(siblings[1])

        await program.parseAsync(['node', 'td', 'project', 'reorder', 'id:p-2', '--position', '1'])

        expect(mockReorderProjects).not.toHaveBeenCalled()
    })

    it('--json outputs the new ordering and suppresses the standard log line', async () => {
        const program = createProgram()
        primeProjects(siblings[2])

        await program.parseAsync([
            'node',
            'td',
            'project',
            'reorder',
            'id:p-3',
            '--position',
            '0',
            '--json',
        ])

        const calls = consoleSpy.mock.calls.map((c: unknown[]) => c[0] as string)
        expect(calls.some((line: string) => line.startsWith('Reordered'))).toBe(false)
        const jsonLine = calls.find((line: string) => line.trim().startsWith('['))
        expect(jsonLine).toBeDefined()
        const parsed = JSON.parse(jsonLine as string)
        expect(parsed).toEqual([
            { id: 'p-3', name: 'Charlie', position: 0 },
            { id: 'p-1', name: 'Alpha', position: 1 },
            { id: 'p-2', name: 'Bravo', position: 2 },
            { id: 'p-4', name: 'Delta', position: 3 },
        ])
    })

    it('--json on a no-op still emits the current ordering', async () => {
        const program = createProgram()
        primeProjects(siblings[1])

        await program.parseAsync([
            'node',
            'td',
            'project',
            'reorder',
            'id:p-2',
            '--position',
            '1',
            '--json',
        ])

        expect(mockReorderProjects).not.toHaveBeenCalled()
        const calls = consoleSpy.mock.calls.map((c: unknown[]) => c[0] as string)
        const jsonLine = calls.find((line: string) => line.trim().startsWith('['))
        expect(jsonLine).toBeDefined()
        const parsed = JSON.parse(jsonLine as string) as Array<{ id: string }>
        expect(parsed.map((p) => p.id)).toEqual(['p-1', 'p-2', 'p-3', 'p-4'])
    })
})
