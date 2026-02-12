import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api/core.js', () => ({
    getApi: vi.fn(),
}))

import { registerLabelCommand } from '../commands/label.js'
import { getApi } from '../lib/api/core.js'

const mockGetApi = vi.mocked(getApi)

function createMockApi() {
    return {
        getLabels: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
        addLabel: vi.fn(),
        deleteLabel: vi.fn(),
        updateLabel: vi.fn(),
    }
}

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerLabelCommand(program)
    return program
}

describe('label list', () => {
    let mockApi: ReturnType<typeof createMockApi>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('lists all labels', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getLabels.mockResolvedValue({
            results: [
                { id: 'label-1', name: 'urgent', color: 'red', isFavorite: false },
                { id: 'label-2', name: 'home', color: 'green', isFavorite: false },
            ],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'label', 'list'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('@urgent'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('@home'))
        consoleSpy.mockRestore()
    })

    it('shows "No labels found" when empty', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getLabels.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'label', 'list'])

        expect(consoleSpy).toHaveBeenCalledWith('No labels found.')
        consoleSpy.mockRestore()
    })

    it('outputs JSON with --json flag', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getLabels.mockResolvedValue({
            results: [{ id: 'label-1', name: 'urgent', color: 'red', isFavorite: true }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'label', 'list', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.results).toBeDefined()
        expect(parsed.results[0].name).toBe('urgent')
        consoleSpy.mockRestore()
    })

    it('outputs NDJSON with --ndjson flag', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getLabels.mockResolvedValue({
            results: [
                { id: 'label-1', name: 'urgent' },
                { id: 'label-2', name: 'home' },
            ],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'label', 'list', '--ndjson'])

        const output = consoleSpy.mock.calls[0][0]
        const lines = output.split('\n')
        expect(lines).toHaveLength(2)
        consoleSpy.mockRestore()
    })
})

describe('label create', () => {
    let mockApi: ReturnType<typeof createMockApi>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('creates label with name', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.addLabel.mockResolvedValue({ id: 'label-new', name: 'work' })

        await program.parseAsync(['node', 'td', 'label', 'create', '--name', 'work'])

        expect(mockApi.addLabel).toHaveBeenCalledWith(expect.objectContaining({ name: 'work' }))
        expect(consoleSpy).toHaveBeenCalledWith('Created: @work')
        consoleSpy.mockRestore()
    })

    it('creates label with --color', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.addLabel.mockResolvedValue({
            id: 'label-new',
            name: 'urgent',
            color: 'red',
        })

        await program.parseAsync([
            'node',
            'td',
            'label',
            'create',
            '--name',
            'urgent',
            '--color',
            'red',
        ])

        expect(mockApi.addLabel).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'urgent', color: 'red' }),
        )
        consoleSpy.mockRestore()
    })

    it('creates label with --favorite', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.addLabel.mockResolvedValue({
            id: 'label-new',
            name: 'important',
            isFavorite: true,
        })

        await program.parseAsync([
            'node',
            'td',
            'label',
            'create',
            '--name',
            'important',
            '--favorite',
        ])

        expect(mockApi.addLabel).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'important', isFavorite: true }),
        )
        consoleSpy.mockRestore()
    })

    it('shows label ID after creation', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.addLabel.mockResolvedValue({ id: 'label-xyz', name: 'test' })

        await program.parseAsync(['node', 'td', 'label', 'create', '--name', 'test'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('label-xyz'))
        consoleSpy.mockRestore()
    })
})

describe('label delete', () => {
    let mockApi: ReturnType<typeof createMockApi>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('shows dry-run without --yes', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getLabels.mockResolvedValue({
            results: [{ id: 'label-1', name: 'urgent' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'label', 'delete', 'urgent'])

        expect(mockApi.deleteLabel).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith('Would delete: @urgent')
        expect(consoleSpy).toHaveBeenCalledWith('Use --yes to confirm.')
        consoleSpy.mockRestore()
    })

    it('deletes by name with --yes', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getLabels.mockResolvedValue({
            results: [{ id: 'label-1', name: 'urgent' }],
            nextCursor: null,
        })
        mockApi.deleteLabel.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'label', 'delete', 'urgent', '--yes'])

        expect(mockApi.deleteLabel).toHaveBeenCalledWith('label-1')
        expect(consoleSpy).toHaveBeenCalledWith('Deleted: @urgent')
        consoleSpy.mockRestore()
    })

    it('deletes by id: prefix with --yes', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getLabels.mockResolvedValue({
            results: [{ id: 'label-123', name: 'urgent' }],
            nextCursor: null,
        })
        mockApi.deleteLabel.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'label', 'delete', 'id:label-123', '--yes'])

        expect(mockApi.deleteLabel).toHaveBeenCalledWith('label-123')
        expect(consoleSpy).toHaveBeenCalledWith('Deleted: @urgent')
        consoleSpy.mockRestore()
    })

    it('handles @-prefixed name', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getLabels.mockResolvedValue({
            results: [{ id: 'label-1', name: 'home' }],
            nextCursor: null,
        })
        mockApi.deleteLabel.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'label', 'delete', '@home', '--yes'])

        expect(mockApi.deleteLabel).toHaveBeenCalledWith('label-1')
        consoleSpy.mockRestore()
    })

    it('throws for non-existent label', async () => {
        const program = createProgram()

        mockApi.getLabels.mockResolvedValue({ results: [], nextCursor: null })

        await expect(
            program.parseAsync(['node', 'td', 'label', 'delete', 'nonexistent', '--yes']),
        ).rejects.toThrow('LABEL_NOT_FOUND')
    })
})

describe('label update', () => {
    let mockApi: ReturnType<typeof createMockApi>

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('updates label name', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getLabels.mockResolvedValue({
            results: [{ id: 'label-1', name: 'old-name' }],
            nextCursor: null,
        })
        mockApi.updateLabel.mockResolvedValue({ id: 'label-1', name: 'new-name' })

        await program.parseAsync([
            'node',
            'td',
            'label',
            'update',
            'old-name',
            '--name',
            'new-name',
        ])

        expect(mockApi.updateLabel).toHaveBeenCalledWith('label-1', {
            name: 'new-name',
        })
        expect(consoleSpy).toHaveBeenCalledWith('Updated: @old-name → @new-name')
        consoleSpy.mockRestore()
    })

    it('updates label color and favorite', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getLabels.mockResolvedValue({
            results: [{ id: 'label-1', name: 'work' }],
            nextCursor: null,
        })
        mockApi.updateLabel.mockResolvedValue({
            id: 'label-1',
            name: 'work',
            color: 'red',
            isFavorite: true,
        })

        await program.parseAsync([
            'node',
            'td',
            'label',
            'update',
            'work',
            '--color',
            'red',
            '--favorite',
        ])

        expect(mockApi.updateLabel).toHaveBeenCalledWith('label-1', {
            color: 'red',
            isFavorite: true,
        })
        consoleSpy.mockRestore()
    })

    it('removes favorite with --no-favorite', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getLabels.mockResolvedValue({
            results: [{ id: 'label-1', name: 'work', isFavorite: true }],
            nextCursor: null,
        })
        mockApi.updateLabel.mockResolvedValue({
            id: 'label-1',
            name: 'work',
            isFavorite: false,
        })

        await program.parseAsync(['node', 'td', 'label', 'update', 'work', '--no-favorite'])

        expect(mockApi.updateLabel).toHaveBeenCalledWith('label-1', {
            isFavorite: false,
        })
        consoleSpy.mockRestore()
    })

    it('updates by id: prefix', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getLabels.mockResolvedValue({
            results: [{ id: 'label-123', name: 'existing' }],
            nextCursor: null,
        })
        mockApi.updateLabel.mockResolvedValue({
            id: 'label-123',
            name: 'existing',
            color: 'blue',
        })

        await program.parseAsync([
            'node',
            'td',
            'label',
            'update',
            'id:label-123',
            '--color',
            'blue',
        ])

        expect(mockApi.updateLabel).toHaveBeenCalledWith('label-123', {
            color: 'blue',
        })
        consoleSpy.mockRestore()
    })

    it('handles @-prefixed name', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getLabels.mockResolvedValue({
            results: [{ id: 'label-1', name: 'home' }],
            nextCursor: null,
        })
        mockApi.updateLabel.mockResolvedValue({
            id: 'label-1',
            name: 'home',
            color: 'green',
        })

        await program.parseAsync(['node', 'td', 'label', 'update', '@home', '--color', 'green'])

        expect(mockApi.updateLabel).toHaveBeenCalledWith('label-1', {
            color: 'green',
        })
        consoleSpy.mockRestore()
    })

    it('throws when no changes specified', async () => {
        const program = createProgram()

        mockApi.getLabels.mockResolvedValue({
            results: [{ id: 'label-1', name: 'work' }],
            nextCursor: null,
        })

        await expect(program.parseAsync(['node', 'td', 'label', 'update', 'work'])).rejects.toThrow(
            'NO_CHANGES',
        )
    })

    it('throws for non-existent label', async () => {
        const program = createProgram()

        mockApi.getLabels.mockResolvedValue({ results: [], nextCursor: null })

        await expect(
            program.parseAsync([
                'node',
                'td',
                'label',
                'update',
                'nonexistent',
                '--name',
                'new-name',
            ]),
        ).rejects.toThrow('LABEL_NOT_FOUND')
    })
})
