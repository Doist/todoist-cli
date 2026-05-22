import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/api/core.js', () => ({
    getApi: vi.fn(),
}))

import { setupApiMock } from '../../test-support/api-mock.js'
import { mockConsoleLog } from '../../test-support/console-spy.js'
import { type MockApi } from '../../test-support/mock-api.js'
import { createTestProgram } from '../../test-support/program.js'
import { registerLabelCommand } from './index.js'

function createProgram() {
    return createTestProgram(registerLabelCommand)
}

describe('label list', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('lists all labels', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

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
    })

    it('shows "No labels found" when empty', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockApi.getLabels.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'label', 'list'])

        expect(consoleSpy).toHaveBeenCalledWith('No labels found.')
    })

    it('outputs JSON with --json flag', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockApi.getLabels.mockResolvedValue({
            results: [{ id: 'label-1', name: 'urgent', color: 'red', isFavorite: true }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'label', 'list', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.results).toBeDefined()
        expect(parsed.results[0].name).toBe('urgent')
    })

    it('outputs NDJSON with --ndjson flag', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

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
    })
})

describe('label list --search', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('searches labels by name', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockApi.searchLabels.mockResolvedValue({
            results: [{ id: 'label-1', name: 'bugfix', color: 'red', isFavorite: false }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'label', 'list', '--search', 'bug'])

        expect(mockApi.searchLabels).toHaveBeenCalledWith(expect.objectContaining({ query: 'bug' }))
        expect(mockApi.getLabels).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('@bugfix'))
    })

    it('includes matching shared labels in search results', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockApi.searchLabels.mockResolvedValue({ results: [], nextCursor: null })
        mockApi.getSharedLabels.mockResolvedValue({
            results: ['team-bug', 'team-review'],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'label', 'list', '--search', 'bug'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('@team-bug'))
        expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('@team-review'))
    })

    it('outputs search results as JSON', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockApi.searchLabels.mockResolvedValue({
            results: [{ id: 'label-1', name: 'bugfix', color: 'red', isFavorite: false }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'label', 'list', '--search', 'bug', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.results).toBeDefined()
        expect(parsed.results[0].name).toBe('bugfix')
    })

    it('shows "No labels found" when search has no results', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockApi.searchLabels.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'label', 'list', '--search', 'nonexistent'])

        expect(consoleSpy).toHaveBeenCalledWith('No labels found.')
    })
})

describe('label rename-shared', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('renames a shared label', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()
        mockApi.getSharedLabels.mockResolvedValue({
            results: ['oldname'],
            nextCursor: null,
        })

        await program.parseAsync([
            'node',
            'td',
            'label',
            'rename-shared',
            'oldname',
            '--name',
            'newname',
        ])

        expect(mockApi.renameSharedLabel).toHaveBeenCalledWith({
            name: 'oldname',
            newName: 'newname',
        })
        expect(consoleSpy).toHaveBeenCalledWith('Renamed: @oldname → @newname')
    })

    it('strips @ prefix from name', async () => {
        const program = createProgram()
        mockConsoleLog()
        mockApi.getSharedLabels.mockResolvedValue({
            results: ['oldname'],
            nextCursor: null,
        })

        await program.parseAsync([
            'node',
            'td',
            'label',
            'rename-shared',
            '@oldname',
            '--name',
            'newname',
        ])

        expect(mockApi.renameSharedLabel).toHaveBeenCalledWith({
            name: 'oldname',
            newName: 'newname',
        })
    })

    it('previews rename with --dry-run', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()
        mockApi.getSharedLabels.mockResolvedValue({
            results: ['oldname'],
            nextCursor: null,
        })

        await program.parseAsync([
            'node',
            'td',
            'label',
            'rename-shared',
            'oldname',
            '--name',
            'newname',
            '--dry-run',
        ])

        expect(mockApi.renameSharedLabel).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'))
    })

    it('throws when shared label not found', async () => {
        const program = createProgram()
        mockConsoleLog()

        await expect(
            program.parseAsync([
                'node',
                'td',
                'label',
                'rename-shared',
                'nonexistent',
                '--name',
                'newname',
            ]),
        ).rejects.toThrow('Shared label "nonexistent" not found.')
    })
})

describe('label remove-shared', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('removes a shared label with --yes', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()
        mockApi.getSharedLabels.mockResolvedValue({
            results: ['oldname'],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'label', 'remove-shared', 'oldname', '--yes'])

        expect(mockApi.removeSharedLabel).toHaveBeenCalledWith({ name: 'oldname' })
        expect(consoleSpy).toHaveBeenCalledWith('Removed shared label: @oldname')
    })

    it('strips @ prefix from name', async () => {
        const program = createProgram()
        mockConsoleLog()
        mockApi.getSharedLabels.mockResolvedValue({
            results: ['oldname'],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'label', 'remove-shared', '@oldname', '--yes'])

        expect(mockApi.removeSharedLabel).toHaveBeenCalledWith({ name: 'oldname' })
    })

    it('shows confirmation prompt without --yes', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()
        mockApi.getSharedLabels.mockResolvedValue({
            results: ['oldname'],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'label', 'remove-shared', 'oldname'])

        expect(mockApi.removeSharedLabel).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith('Would remove shared label: @oldname')
        expect(consoleSpy).toHaveBeenCalledWith('Use --yes to confirm.')
    })

    it('previews removal with --dry-run', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()
        mockApi.getSharedLabels.mockResolvedValue({
            results: ['oldname'],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'label', 'remove-shared', 'oldname', '--dry-run'])

        expect(mockApi.removeSharedLabel).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'))
    })

    it('throws when shared label not found', async () => {
        const program = createProgram()
        mockConsoleLog()

        await expect(
            program.parseAsync(['node', 'td', 'label', 'remove-shared', 'nonexistent', '--yes']),
        ).rejects.toThrow('Shared label "nonexistent" not found.')
    })
})

describe('label create --json', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('outputs created label as JSON', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockApi.addLabel.mockResolvedValue({
            id: 'label-new',
            name: 'work',
            color: 'charcoal',
            isFavorite: false,
        })

        await program.parseAsync(['node', 'td', 'label', 'create', '--name', 'work', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.id).toBe('label-new')
        expect(parsed.name).toBe('work')
        expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Created:'))
    })
})

describe('label update --json', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('outputs updated label as JSON', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockApi.getLabels.mockResolvedValue({
            results: [{ id: 'label-1', name: 'work', color: 'charcoal', isFavorite: false }],
            nextCursor: null,
        })
        mockApi.updateLabel.mockResolvedValue({
            id: 'label-1',
            name: 'renamed',
            color: 'charcoal',
            isFavorite: false,
        })

        await program.parseAsync([
            'node',
            'td',
            'label',
            'update',
            'work',
            '--name',
            'renamed',
            '--json',
        ])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.id).toBe('label-1')
        expect(parsed.name).toBe('renamed')
        expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Updated:'))
    })
})

describe('label create', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('creates label with name', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockApi.addLabel.mockResolvedValue({ id: 'label-new', name: 'work' })

        await program.parseAsync(['node', 'td', 'label', 'create', '--name', 'work'])

        expect(mockApi.addLabel).toHaveBeenCalledWith(expect.objectContaining({ name: 'work' }))
        expect(consoleSpy).toHaveBeenCalledWith('Created: @work')
    })

    it('creates label with --color', async () => {
        const program = createProgram()
        mockConsoleLog()

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
    })

    it('creates label with --favorite', async () => {
        const program = createProgram()
        mockConsoleLog()

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
    })

    it('shows label ID after creation', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockApi.addLabel.mockResolvedValue({ id: 'label-xyz', name: 'test' })

        await program.parseAsync(['node', 'td', 'label', 'create', '--name', 'test'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('label-xyz'))
    })
})

describe('label delete', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('shows dry-run without --yes', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockApi.getLabels.mockResolvedValue({
            results: [{ id: 'label-1', name: 'urgent' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'label', 'delete', 'urgent'])

        expect(mockApi.deleteLabel).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith('Would delete: @urgent')
        expect(consoleSpy).toHaveBeenCalledWith('Use --yes to confirm.')
    })

    it('deletes by name with --yes', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockApi.getLabels.mockResolvedValue({
            results: [{ id: 'label-1', name: 'urgent' }],
            nextCursor: null,
        })
        mockApi.deleteLabel.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'label', 'delete', 'urgent', '--yes'])

        expect(mockApi.deleteLabel).toHaveBeenCalledWith('label-1')
        expect(consoleSpy).toHaveBeenCalledWith('Deleted: @urgent (id:label-1)')
    })

    it('deletes by id: prefix with --yes', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockApi.getLabels.mockResolvedValue({
            results: [{ id: 'label-123', name: 'urgent' }],
            nextCursor: null,
        })
        mockApi.deleteLabel.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'label', 'delete', 'id:label-123', '--yes'])

        expect(mockApi.deleteLabel).toHaveBeenCalledWith('label-123')
        expect(consoleSpy).toHaveBeenCalledWith('Deleted: @urgent (id:label-123)')
    })

    it('handles @-prefixed name', async () => {
        const program = createProgram()
        mockConsoleLog()

        mockApi.getLabels.mockResolvedValue({
            results: [{ id: 'label-1', name: 'home' }],
            nextCursor: null,
        })
        mockApi.deleteLabel.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'label', 'delete', '@home', '--yes'])

        expect(mockApi.deleteLabel).toHaveBeenCalledWith('label-1')
    })

    it('throws for non-existent label', async () => {
        const program = createProgram()

        mockApi.getLabels.mockResolvedValue({ results: [], nextCursor: null })

        await expect(
            program.parseAsync(['node', 'td', 'label', 'delete', 'nonexistent', '--yes']),
        ).rejects.toHaveProperty('code', 'LABEL_NOT_FOUND')
    })
})

describe('label update', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('updates label name', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

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
        expect(consoleSpy).toHaveBeenCalledWith('Updated: @old-name → @new-name (id:label-1)')
    })

    it('updates label color and favorite', async () => {
        const program = createProgram()
        mockConsoleLog()

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
    })

    it('removes favorite with --no-favorite', async () => {
        const program = createProgram()
        mockConsoleLog()

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
    })

    it('updates by id: prefix', async () => {
        const program = createProgram()
        mockConsoleLog()

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
    })

    it('handles @-prefixed name', async () => {
        const program = createProgram()
        mockConsoleLog()

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
    })

    it('throws when no changes specified', async () => {
        const program = createProgram()

        mockApi.getLabels.mockResolvedValue({
            results: [{ id: 'label-1', name: 'work' }],
            nextCursor: null,
        })

        await expect(
            program.parseAsync(['node', 'td', 'label', 'update', 'work']),
        ).rejects.toHaveProperty('code', 'NO_CHANGES')
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
        ).rejects.toHaveProperty('code', 'LABEL_NOT_FOUND')
    })
})

describe('label URL resolution', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('resolves label by URL in delete command', async () => {
        const program = createProgram()
        mockConsoleLog()

        mockApi.getLabels.mockResolvedValue({
            results: [{ id: 'label1', name: 'urgent' }],
            nextCursor: null,
        })
        mockApi.deleteLabel.mockResolvedValue(undefined)

        await program.parseAsync([
            'node',
            'td',
            'label',
            'delete',
            'https://app.todoist.com/app/label/urgent-label1',
            '--yes',
        ])

        expect(mockApi.deleteLabel).toHaveBeenCalledWith('label1')
    })

    it('resolves label by URL in update command', async () => {
        const program = createProgram()
        mockConsoleLog()

        mockApi.getLabels.mockResolvedValue({
            results: [{ id: 'label1', name: 'urgent' }],
            nextCursor: null,
        })
        mockApi.updateLabel.mockResolvedValue({ id: 'label1', name: 'urgent', color: 'blue' })

        await program.parseAsync([
            'node',
            'td',
            'label',
            'update',
            'https://app.todoist.com/app/label/urgent-label1',
            '--color',
            'blue',
        ])

        expect(mockApi.updateLabel).toHaveBeenCalledWith('label1', { color: 'blue' })
    })

    it('throws entity type mismatch for task URL in label command', async () => {
        const program = createProgram()

        mockApi.getLabels.mockResolvedValue({
            results: [{ id: 'label-1', name: 'urgent' }],
            nextCursor: null,
        })

        await expect(
            program.parseAsync([
                'node',
                'td',
                'label',
                'delete',
                'https://app.todoist.com/app/task/buy-milk-task1',
                '--yes',
            ]),
        ).rejects.toThrow('Expected a label URL, but got a task URL')
    })

    it('throws LABEL_NOT_FOUND when URL ID does not match any label', async () => {
        const program = createProgram()

        mockApi.getLabels.mockResolvedValue({
            results: [{ id: 'label-1', name: 'urgent' }],
            nextCursor: null,
        })

        await expect(
            program.parseAsync([
                'node',
                'td',
                'label',
                'delete',
                'https://app.todoist.com/app/label/urgent-nonexistent',
                '--yes',
            ]),
        ).rejects.toHaveProperty('code', 'LABEL_NOT_FOUND')
    })
})

describe('label view', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('shows label metadata and tasks', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockApi.getLabels.mockResolvedValue({
            results: [{ id: 'label-1', name: 'urgent', color: 'red', isFavorite: false }],
            nextCursor: null,
        })

        mockApi.getTasksByFilter.mockResolvedValue({
            results: [
                {
                    id: 'task-1',
                    content: 'Fix bug',
                    projectId: 'proj-1',
                    priority: 1,
                    labels: ['urgent'],
                },
            ],
            nextCursor: null,
        })

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'label', 'view', 'urgent'])

        expect(mockApi.getTasksByFilter).toHaveBeenCalledWith(
            expect.objectContaining({ query: '@urgent' }),
        )
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('@urgent'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Fix bug'))
    })

    it('shows "No tasks with this label" when empty', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockApi.getLabels.mockResolvedValue({
            results: [{ id: 'label-1', name: 'unused', color: 'red', isFavorite: false }],
            nextCursor: null,
        })

        mockApi.getTasksByFilter.mockResolvedValue({
            results: [],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'label', 'view', 'unused'])

        expect(consoleSpy).toHaveBeenCalledWith('No tasks with this label.')
    })

    it('outputs JSON with --json flag', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockApi.getLabels.mockResolvedValue({
            results: [{ id: 'label-1', name: 'urgent', color: 'red', isFavorite: false }],
            nextCursor: null,
        })

        mockApi.getTasksByFilter.mockResolvedValue({
            results: [
                {
                    id: 'task-1',
                    content: 'Fix bug',
                    projectId: 'proj-1',
                    priority: 1,
                    labels: ['urgent'],
                },
            ],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'label', 'view', 'urgent', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.results).toBeDefined()
        expect(parsed.results[0].content).toBe('Fix bug')
    })

    it('defaults to view subcommand (td label <ref>)', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockApi.getLabels.mockResolvedValue({
            results: [{ id: 'label-1', name: 'urgent', color: 'red', isFavorite: false }],
            nextCursor: null,
        })

        mockApi.getTasksByFilter.mockResolvedValue({
            results: [],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'label', 'urgent'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('@urgent'))
    })

    it('resolves label by URL in view command', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockApi.getLabels.mockResolvedValue({
            results: [{ id: 'label1', name: 'urgent', color: 'red', isFavorite: false }],
            nextCursor: null,
        })

        mockApi.getTasksByFilter.mockResolvedValue({
            results: [],
            nextCursor: null,
        })

        await program.parseAsync([
            'node',
            'td',
            'label',
            'view',
            'https://app.todoist.com/app/label/urgent-label1',
        ])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('@urgent'))
    })

    it('shows favorite indicator', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockApi.getLabels.mockResolvedValue({
            results: [{ id: 'label-1', name: 'urgent', color: 'red', isFavorite: true }],
            nextCursor: null,
        })

        mockApi.getTasksByFilter.mockResolvedValue({
            results: [],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'label', 'view', 'urgent'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Favorite'))
    })
})

describe('shared labels', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    describe('label list', () => {
        it('shows shared labels after personal labels', async () => {
            const program = createProgram()
            const consoleSpy = mockConsoleLog()

            mockApi.getLabels.mockResolvedValue({
                results: [{ id: 'label-1', name: 'urgent', color: 'red', isFavorite: false }],
                nextCursor: null,
            })
            mockApi.getSharedLabels.mockResolvedValue({
                results: ['team-review'],
                nextCursor: null,
            })

            await program.parseAsync(['node', 'td', 'label', 'list'])

            const calls = consoleSpy.mock.calls.map((c) => c[0])
            const urgentIdx = calls.findIndex((c: string) => c.includes('@urgent'))
            const sharedIdx = calls.findIndex((c: string) => c.includes('@team-review'))
            expect(urgentIdx).toBeGreaterThanOrEqual(0)
            expect(sharedIdx).toBeGreaterThan(urgentIdx)
            expect(calls[sharedIdx]).toContain('(shared)')
        })

        it('shows only shared labels when no personal labels exist', async () => {
            const program = createProgram()
            const consoleSpy = mockConsoleLog()

            mockApi.getLabels.mockResolvedValue({ results: [], nextCursor: null })
            mockApi.getSharedLabels.mockResolvedValue({
                results: ['team-review'],
                nextCursor: null,
            })

            await program.parseAsync(['node', 'td', 'label', 'list'])

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('@team-review'))
            expect(consoleSpy).not.toHaveBeenCalledWith('No labels found.')
        })

        it('fetches shared labels with omitPersonal: true', async () => {
            const program = createProgram()
            mockConsoleLog()

            mockApi.getLabels.mockResolvedValue({ results: [], nextCursor: null })
            mockApi.getSharedLabels.mockResolvedValue({ results: [], nextCursor: null })

            await program.parseAsync(['node', 'td', 'label', 'list'])

            expect(mockApi.getSharedLabels).toHaveBeenCalledWith(
                expect.objectContaining({ omitPersonal: true }),
            )
        })

        it('includes sharedLabels array in JSON output', async () => {
            const program = createProgram()
            const consoleSpy = mockConsoleLog()

            mockApi.getLabels.mockResolvedValue({
                results: [{ id: 'label-1', name: 'urgent', color: 'red', isFavorite: false }],
                nextCursor: null,
            })
            mockApi.getSharedLabels.mockResolvedValue({
                results: ['team-review', 'external'],
                nextCursor: null,
            })

            await program.parseAsync(['node', 'td', 'label', 'list', '--json'])

            const output = consoleSpy.mock.calls[0][0]
            const parsed = JSON.parse(output)
            expect(parsed.sharedLabels).toEqual(['team-review', 'external'])
            expect(parsed.results[0].name).toBe('urgent')
        })
    })

    describe('label view', () => {
        it('resolves shared-only label by name', async () => {
            const program = createProgram()
            const consoleSpy = mockConsoleLog()

            mockApi.getLabels.mockResolvedValue({ results: [], nextCursor: null })
            mockApi.getSharedLabels.mockResolvedValue({
                results: ['team-review'],
                nextCursor: null,
            })
            mockApi.getTasksByFilter.mockResolvedValue({ results: [], nextCursor: null })

            await program.parseAsync(['node', 'td', 'label', 'view', 'team-review'])

            expect(mockApi.getTasksByFilter).toHaveBeenCalledWith(
                expect.objectContaining({ query: '@team-review' }),
            )
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('@team-review'))
        })

        it('prefers personal label over shared with same name', async () => {
            const program = createProgram()
            const consoleSpy = mockConsoleLog()

            mockApi.getLabels.mockResolvedValue({
                results: [{ id: 'label-1', name: 'review', color: 'blue', isFavorite: false }],
                nextCursor: null,
            })
            mockApi.getTasksByFilter.mockResolvedValue({ results: [], nextCursor: null })

            await program.parseAsync(['node', 'td', 'label', 'view', 'review'])

            // Should show personal label metadata (ID, color)
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('label-1'))
            // Should NOT call getSharedLabels (personal match found first)
            expect(mockApi.getSharedLabels).not.toHaveBeenCalled()
        })

        it('shows "shared label" type for shared-only labels', async () => {
            const program = createProgram()
            const consoleSpy = mockConsoleLog()

            mockApi.getLabels.mockResolvedValue({ results: [], nextCursor: null })
            mockApi.getSharedLabels.mockResolvedValue({
                results: ['team-review'],
                nextCursor: null,
            })
            mockApi.getTasksByFilter.mockResolvedValue({ results: [], nextCursor: null })

            await program.parseAsync(['node', 'td', 'label', 'view', 'team-review'])

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('shared label'))
        })
    })

    describe('delete/update do not fall back to shared', () => {
        it('delete throws LABEL_NOT_FOUND for shared-only label', async () => {
            const program = createProgram()

            mockApi.getLabels.mockResolvedValue({ results: [], nextCursor: null })
            mockApi.getSharedLabels.mockResolvedValue({
                results: ['team-review'],
                nextCursor: null,
            })

            await expect(
                program.parseAsync(['node', 'td', 'label', 'delete', 'team-review', '--yes']),
            ).rejects.toHaveProperty('code', 'LABEL_NOT_FOUND')
        })

        it('update throws LABEL_NOT_FOUND for shared-only label', async () => {
            const program = createProgram()

            mockApi.getLabels.mockResolvedValue({ results: [], nextCursor: null })
            mockApi.getSharedLabels.mockResolvedValue({
                results: ['team-review'],
                nextCursor: null,
            })

            await expect(
                program.parseAsync([
                    'node',
                    'td',
                    'label',
                    'update',
                    'team-review',
                    '--name',
                    'new-name',
                ]),
            ).rejects.toHaveProperty('code', 'LABEL_NOT_FOUND')
        })
    })
})

describe('label (no args)', () => {
    it('shows parent help listing all subcommands', async () => {
        const program = createProgram()
        const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

        try {
            await program.parseAsync(['node', 'td', 'label'])
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
    })
})

describe('label --dry-run', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('label create --dry-run previews without calling API', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        await program.parseAsync(['node', 'td', 'label', 'create', '--name', 'urgent', '--dry-run'])

        expect(mockApi.addLabel).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would create label'))
    })

    it('label delete --dry-run previews without calling API', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockApi.getLabels.mockResolvedValue({
            results: [
                {
                    id: 'label-1',
                    name: 'urgent',
                    color: 'red',
                    order: 1,
                    isFavorite: false,
                    isDeleted: false,
                },
            ],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'label', 'delete', 'urgent', '--dry-run'])

        expect(mockApi.deleteLabel).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would delete label'))
    })

    it('label update --dry-run previews without calling API', async () => {
        const program = createProgram()
        const consoleSpy = mockConsoleLog()

        mockApi.getLabels.mockResolvedValue({
            results: [
                {
                    id: 'label-1',
                    name: 'urgent',
                    color: 'red',
                    order: 1,
                    isFavorite: false,
                    isDeleted: false,
                },
            ],
            nextCursor: null,
        })

        await program.parseAsync([
            'node',
            'td',
            'label',
            'update',
            'urgent',
            '--name',
            'critical',
            '--dry-run',
        ])

        expect(mockApi.updateLabel).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would update label'))
    })
})
