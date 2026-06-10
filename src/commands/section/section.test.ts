import { captureConsole, createTestProgram } from '@doist/cli-core/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/api/core.js', () => ({
    getApi: vi.fn(),
}))

vi.mock('../../lib/stdin.js', () => ({
    readStdin: vi.fn(),
}))

import { readStdin } from '../../lib/stdin.js'
import { setupApiMock } from '../../test-support/api-mock.js'
import { fixtures } from '../../test-support/fixtures.js'
import { type MockApi } from '../../test-support/mock-api.js'
import { registerSectionCommand } from './index.js'

const mockReadStdin = vi.mocked(readStdin)

function createProgram() {
    return createTestProgram(registerSectionCommand)
}

function expectSectionReorderCommand(
    mockApi: MockApi,
    sections: Array<{ id: string; sectionOrder: number }>,
) {
    expect(mockApi.sync).toHaveBeenCalledTimes(1)
    expect(mockApi.sync).toHaveBeenCalledWith({
        commands: [
            expect.objectContaining({
                type: 'section_reorder',
                args: { sections },
            }),
        ],
    })
}

describe('section list', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('resolves project and lists sections', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })
        mockApi.getSections.mockResolvedValue({
            results: [
                { id: 'sec-1', name: 'Planning' },
                { id: 'sec-2', name: 'In Progress' },
            ],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'section', 'list', 'Work'])

        expect(mockApi.getSections).toHaveBeenCalledWith(
            expect.objectContaining({ projectId: 'proj-1' }),
        )
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Planning'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('In Progress'))
    })

    it('shows "No sections" when empty', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getProject.mockResolvedValue({ id: 'proj-1', name: 'Work' })
        mockApi.getSections.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'section', 'list', 'id:proj-1'])

        expect(consoleSpy).toHaveBeenCalledWith('No sections.')
    })

    it('outputs JSON with --json flag', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getProject.mockResolvedValue({ id: 'proj-1', name: 'Work' })
        mockApi.getSections.mockResolvedValue({
            results: [{ id: 'sec-1', name: 'Planning', projectId: 'proj-1' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'section', 'list', 'id:proj-1', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.results).toBeDefined()
        expect(parsed.results[0].name).toBe('Planning')
    })

    it('accepts --project flag instead of positional arg', async () => {
        const program = createProgram()
        captureConsole()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })
        mockApi.getSections.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'section', 'list', '--project', 'Work'])

        expect(mockApi.getSections).toHaveBeenCalledWith(
            expect.objectContaining({ projectId: 'proj-1' }),
        )
    })

    it('errors when both positional and --project are provided', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'td', 'section', 'list', 'Work', '--project', 'Personal']),
        ).rejects.toThrow('Cannot specify project both as argument and --project flag')
    })

    it('searches sections by name with --search', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.searchSections.mockResolvedValue({
            results: [
                { id: 'sec-1', name: 'Planning' },
                { id: 'sec-2', name: 'Planning v2' },
            ],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'section', 'list', '--search', 'Plan'])

        expect(mockApi.searchSections).toHaveBeenCalledWith(
            expect.objectContaining({ query: 'Plan' }),
        )
        expect(mockApi.getSections).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Planning'))
    })

    it('searches sections scoped to a project with --search and --project', async () => {
        const program = createProgram()
        captureConsole()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })
        mockApi.searchSections.mockResolvedValue({
            results: [{ id: 'sec-1', name: 'Planning' }],
            nextCursor: null,
        })

        await program.parseAsync([
            'node',
            'td',
            'section',
            'list',
            '--search',
            'Plan',
            '--project',
            'Work',
        ])

        expect(mockApi.searchSections).toHaveBeenCalledWith(
            expect.objectContaining({ query: 'Plan', projectId: 'proj-1' }),
        )
    })

    it('outputs JSON with --search and --json', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.searchSections.mockResolvedValue({
            results: [{ id: 'sec-1', name: 'Planning', projectId: 'proj-1' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'section', 'list', '--search', 'Plan', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.results[0].name).toBe('Planning')
    })
})

describe('section create --json', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('outputs created section as JSON', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getProject.mockResolvedValue({ id: 'proj-1', name: 'Work' })
        mockApi.addSection.mockResolvedValue({
            id: 'sec-new',
            name: 'New Section',
            description: 'Section notes',
            projectId: 'proj-1',
            sectionOrder: 1,
        })

        await program.parseAsync([
            'node',
            'td',
            'section',
            'create',
            '--name',
            'New Section',
            '--project',
            'id:proj-1',
            '--json',
        ])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.id).toBe('sec-new')
        expect(parsed.name).toBe('New Section')
        // Regression guard: `description` must survive the curated JSON projection.
        expect(parsed.description).toBe('Section notes')
        expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Created:'))
    })
})

describe('section update --json', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('outputs updated section as JSON', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getSection.mockResolvedValue({ id: 'sec-1', name: 'Old Name', projectId: 'proj-1' })
        mockApi.updateSection.mockResolvedValue({
            id: 'sec-1',
            name: 'New Name',
            description: 'Updated notes',
            projectId: 'proj-1',
            sectionOrder: 1,
        })

        await program.parseAsync([
            'node',
            'td',
            'section',
            'update',
            'id:sec-1',
            '--name',
            'New Name',
            '--json',
        ])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.id).toBe('sec-1')
        expect(parsed.name).toBe('New Name')
        // Regression guard: `description` must survive the curated JSON projection.
        expect(parsed.description).toBe('Updated notes')
        expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Updated:'))
    })
})

describe('section reorder', () => {
    let mockApi: MockApi
    let consoleSpy: ReturnType<typeof vi.spyOn>

    const sections = [
        fixtures.sections.planning,
        fixtures.sections.inProgress,
        fixtures.sections.review,
        fixtures.sections.done,
    ]
    const reorderCommandArgs = ['node', 'td', 'section', 'reorder'] as const
    const projectArgs = ['--project', 'id:proj-work'] as const

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
        mockApi.getProject.mockResolvedValue(fixtures.projects.work)
        mockApi.getSections.mockImplementation(async () => ({
            results: [...sections],
            nextCursor: null,
        }))
        consoleSpy = captureConsole()
    })

    it('requires --project', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync([...reorderCommandArgs, 'Review', '--position', '0']),
        ).rejects.toHaveProperty('code', 'MISSING_PROJECT')
    })

    it('throws when no placement flag is provided', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync([...reorderCommandArgs, 'Review', ...projectArgs]),
        ).rejects.toHaveProperty('code', 'INVALID_OPTIONS')
    })

    it('accepts --section instead of positional ref', async () => {
        const program = createProgram()

        await program.parseAsync([
            ...reorderCommandArgs,
            '--section',
            'Review',
            ...projectArgs,
            '--position',
            '0',
        ])

        expectSectionReorderCommand(mockApi, [
            { id: 'sec-3', sectionOrder: 1 },
            { id: 'sec-1', sectionOrder: 2 },
            { id: 'sec-2', sectionOrder: 3 },
            { id: 'sec-4', sectionOrder: 4 },
        ])
    })

    it('errors when both positional and --section are provided', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync([
                ...reorderCommandArgs,
                'Review',
                '--section',
                'Done',
                ...projectArgs,
                '--position',
                '0',
            ]),
        ).rejects.toThrow('Cannot specify section both as argument and --section flag')
    })

    it('throws when more than one placement flag is provided', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync([
                ...reorderCommandArgs,
                'Review',
                ...projectArgs,
                '--before',
                'Done',
                '--position',
                '0',
            ]),
        ).rejects.toHaveProperty('code', 'INVALID_OPTIONS')
    })

    it('rejects non-integer --position values', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync([
                ...reorderCommandArgs,
                'Review',
                ...projectArgs,
                '--position',
                '1.5',
            ]),
        ).rejects.toHaveProperty('code', 'INVALID_ORDER')
    })

    it('--position 0 moves target to first', async () => {
        const program = createProgram()

        await program.parseAsync([
            ...reorderCommandArgs,
            'Review',
            ...projectArgs,
            '--position',
            '0',
        ])

        expectSectionReorderCommand(mockApi, [
            { id: 'sec-3', sectionOrder: 1 },
            { id: 'sec-1', sectionOrder: 2 },
            { id: 'sec-2', sectionOrder: 3 },
            { id: 'sec-4', sectionOrder: 4 },
        ])
        const logLines = (consoleSpy.mock.calls as unknown[][]).map((call) => call[0])
        expect(logLines).toEqual([
            'Reordered "Review" (id:sec-3): position 2 → 0 of 3.',
            'New section order:',
            '  → 0: Review (id:sec-3)',
            '    1: Planning (id:sec-1)',
            '    2: In Progress (id:sec-2)',
            '    3: Done (id:sec-4)',
        ])
    })

    it('--position clamps to last when out of range', async () => {
        const program = createProgram()

        await program.parseAsync([
            ...reorderCommandArgs,
            'Planning',
            ...projectArgs,
            '--position',
            '999',
        ])

        expectSectionReorderCommand(mockApi, [
            { id: 'sec-2', sectionOrder: 1 },
            { id: 'sec-3', sectionOrder: 2 },
            { id: 'sec-4', sectionOrder: 3 },
            { id: 'sec-1', sectionOrder: 4 },
        ])
    })

    it('loads all section pages before reordering', async () => {
        const program = createProgram()
        mockApi.getSections
            .mockResolvedValueOnce({
                results: [fixtures.sections.planning, fixtures.sections.inProgress],
                nextCursor: 'next-page',
            })
            .mockResolvedValueOnce({
                results: [fixtures.sections.review, fixtures.sections.done],
                nextCursor: null,
            })

        await program.parseAsync([
            ...reorderCommandArgs,
            'Review',
            ...projectArgs,
            '--position',
            '0',
        ])

        expect(mockApi.getSections).toHaveBeenNthCalledWith(1, {
            projectId: 'proj-work',
            cursor: undefined,
            limit: 200,
        })
        expect(mockApi.getSections).toHaveBeenNthCalledWith(2, {
            projectId: 'proj-work',
            cursor: 'next-page',
            limit: 200,
        })
        expectSectionReorderCommand(mockApi, [
            { id: 'sec-3', sectionOrder: 1 },
            { id: 'sec-1', sectionOrder: 2 },
            { id: 'sec-2', sectionOrder: 3 },
            { id: 'sec-4', sectionOrder: 4 },
        ])
    })

    it('--before places target immediately before sibling', async () => {
        const program = createProgram()

        await program.parseAsync([
            ...reorderCommandArgs,
            'Done',
            ...projectArgs,
            '--before',
            'In Progress',
        ])

        expectSectionReorderCommand(mockApi, [
            { id: 'sec-1', sectionOrder: 1 },
            { id: 'sec-4', sectionOrder: 2 },
            { id: 'sec-2', sectionOrder: 3 },
            { id: 'sec-3', sectionOrder: 4 },
        ])
    })

    it('--after places target immediately after sibling', async () => {
        const program = createProgram()

        await program.parseAsync([
            ...reorderCommandArgs,
            'Planning',
            ...projectArgs,
            '--after',
            'Review',
        ])

        expectSectionReorderCommand(mockApi, [
            { id: 'sec-2', sectionOrder: 1 },
            { id: 'sec-3', sectionOrder: 2 },
            { id: 'sec-1', sectionOrder: 3 },
            { id: 'sec-4', sectionOrder: 4 },
        ])
    })

    it('rejects relative placement against itself', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync([
                ...reorderCommandArgs,
                'Review',
                ...projectArgs,
                '--before',
                'Review',
            ]),
        ).rejects.toHaveProperty('code', 'INVALID_OPTIONS')
    })

    it('--dry-run previews the new ordering without syncing', async () => {
        const program = createProgram()

        await program.parseAsync([
            ...reorderCommandArgs,
            'Planning',
            ...projectArgs,
            '--position',
            '2',
            '--dry-run',
        ])

        expect(mockApi.sync).not.toHaveBeenCalled()
        const logLines = (consoleSpy.mock.calls as unknown[][]).map((call) => call[0])
        expect(logLines).toEqual([
            'Would reorder "Planning": position 0 → 2',
            'New section order:',
            '    0: In Progress (id:sec-2)',
            '    1: Review (id:sec-3)',
            '  → 2: Planning (id:sec-1)',
            '    3: Done (id:sec-4)',
        ])
    })

    it('no-ops when target already has the requested position', async () => {
        const program = createProgram()

        await program.parseAsync([
            ...reorderCommandArgs,
            'In Progress',
            ...projectArgs,
            '--position',
            '1',
        ])

        expect(mockApi.sync).not.toHaveBeenCalled()
    })

    it('--json on a no-op outputs the current ordering', async () => {
        const program = createProgram()

        await program.parseAsync([
            ...reorderCommandArgs,
            'In Progress',
            ...projectArgs,
            '--position',
            '1',
            '--json',
        ])

        expect(mockApi.sync).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledTimes(1)
        const parsed = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(parsed).toEqual([
            { id: 'sec-1', name: 'Planning', position: 0 },
            { id: 'sec-2', name: 'In Progress', position: 1 },
            { id: 'sec-3', name: 'Review', position: 2 },
            { id: 'sec-4', name: 'Done', position: 3 },
        ])
    })

    it('--json outputs the new ordering', async () => {
        const program = createProgram()

        await program.parseAsync([
            ...reorderCommandArgs,
            'Review',
            ...projectArgs,
            '--position',
            '0',
            '--json',
        ])

        expect(consoleSpy).toHaveBeenCalledTimes(1)
        const parsed = JSON.parse(consoleSpy.mock.calls[0][0])
        expect(parsed).toEqual([
            { id: 'sec-3', name: 'Review', position: 0 },
            { id: 'sec-1', name: 'Planning', position: 1 },
            { id: 'sec-2', name: 'In Progress', position: 2 },
            { id: 'sec-4', name: 'Done', position: 3 },
        ])
    })
})

describe('section create', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('creates section in project', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })
        mockApi.addSection.mockResolvedValue({ id: 'sec-new', name: 'Review' })

        await program.parseAsync([
            'node',
            'td',
            'section',
            'create',
            '--name',
            'Review',
            '--project',
            'Work',
        ])

        expect(mockApi.addSection).toHaveBeenCalledWith({
            name: 'Review',
            projectId: 'proj-1',
        })
        expect(consoleSpy).toHaveBeenCalledWith('Created: Review')
    })

    it('shows section ID after creation', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getProject.mockResolvedValue({ id: 'proj-1', name: 'Work' })
        mockApi.addSection.mockResolvedValue({ id: 'sec-xyz', name: 'Test' })

        await program.parseAsync([
            'node',
            'td',
            'section',
            'create',
            '--name',
            'Test',
            '--project',
            'id:proj-1',
        ])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('sec-xyz'))
    })

    it('creates section with --description', async () => {
        const program = createProgram()

        mockApi.getProject.mockResolvedValue({ id: 'proj-1', name: 'Work' })
        mockApi.addSection.mockResolvedValue({ id: 'sec-new', name: 'Review' })

        await program.parseAsync([
            'node',
            'td',
            'section',
            'create',
            '--name',
            'Review',
            '--project',
            'id:proj-1',
            '--description',
            'Pending review',
        ])

        expect(mockApi.addSection).toHaveBeenCalledWith({
            name: 'Review',
            projectId: 'proj-1',
            description: 'Pending review',
        })
    })

    it('reads description from stdin with --stdin', async () => {
        const program = createProgram()

        mockReadStdin.mockResolvedValue('Piped description')
        mockApi.getProject.mockResolvedValue({ id: 'proj-1', name: 'Work' })
        mockApi.addSection.mockResolvedValue({ id: 'sec-new', name: 'Review' })

        await program.parseAsync([
            'node',
            'td',
            'section',
            'create',
            '--name',
            'Review',
            '--project',
            'id:proj-1',
            '--stdin',
        ])

        expect(mockApi.addSection).toHaveBeenCalledWith(
            expect.objectContaining({ description: 'Piped description' }),
        )
    })

    it('rejects --description together with --stdin', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync([
                'node',
                'td',
                'section',
                'create',
                '--name',
                'Review',
                '--project',
                'id:proj-1',
                '--description',
                'x',
                '--stdin',
            ]),
        ).rejects.toHaveProperty('code', 'CONFLICTING_OPTIONS')
    })
})

describe('section delete', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('rejects plain text references', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'td', 'section', 'delete', 'Planning', '--yes']),
        ).rejects.toHaveProperty('code', 'INVALID_REF')
    })

    it('shows dry-run without --yes', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getSection.mockResolvedValue({ id: 'sec-1', name: 'My Section' })
        mockApi.getTasks.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'section', 'delete', 'id:sec-1'])

        expect(mockApi.deleteSection).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith('Would delete section: My Section')
        expect(consoleSpy).toHaveBeenCalledWith('Use --yes to confirm.')
    })

    it('deletes section with id: prefix and --yes', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getSection.mockResolvedValue({ id: 'sec-123', name: 'My Section' })
        mockApi.getTasks.mockResolvedValue({ results: [], nextCursor: null })
        mockApi.deleteSection.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'section', 'delete', 'id:sec-123', '--yes'])

        expect(mockApi.deleteSection).toHaveBeenCalledWith('sec-123')
        expect(consoleSpy).toHaveBeenCalledWith('Deleted section: My Section (id:sec-123)')
    })

    it('fails when section has uncompleted tasks', async () => {
        const program = createProgram()

        mockApi.getSection.mockResolvedValue({ id: 'sec-1', name: 'My Section' })
        mockApi.getTasks.mockResolvedValue({
            results: [{ id: 't1' }, { id: 't2' }, { id: 't3' }],
            nextCursor: null,
        })

        await expect(
            program.parseAsync(['node', 'td', 'section', 'delete', 'id:sec-1', '--yes']),
        ).rejects.toThrow('3 uncompleted tasks remain')
    })
})

describe('section update', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('rejects plain text references', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync([
                'node',
                'td',
                'section',
                'update',
                'Planning',
                '--name',
                'New Name',
            ]),
        ).rejects.toHaveProperty('code', 'INVALID_REF')
    })

    it('updates section name', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getSection.mockResolvedValue({ id: 'sec-1', name: 'Old Name' })
        mockApi.updateSection.mockResolvedValue({ id: 'sec-1', name: 'New Name' })

        await program.parseAsync([
            'node',
            'td',
            'section',
            'update',
            'id:sec-1',
            '--name',
            'New Name',
        ])

        expect(mockApi.updateSection).toHaveBeenCalledWith('sec-1', {
            name: 'New Name',
        })
        expect(consoleSpy).toHaveBeenCalledWith('Updated: Old Name → New Name (id:sec-1)')
    })

    it('updates description only, without a name change', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getSection.mockResolvedValue({ id: 'sec-1', name: 'Planning' })
        mockApi.updateSection.mockResolvedValue({ id: 'sec-1', name: 'Planning' })

        await program.parseAsync([
            'node',
            'td',
            'section',
            'update',
            'id:sec-1',
            '--description',
            'Sprint backlog',
        ])

        expect(mockApi.updateSection).toHaveBeenCalledWith('sec-1', {
            description: 'Sprint backlog',
        })
        expect(consoleSpy).toHaveBeenCalledWith('Updated: Planning (id:sec-1)')
    })

    it('clears description with empty stdin', async () => {
        const program = createProgram()

        mockReadStdin.mockResolvedValue('')
        mockApi.getSection.mockResolvedValue({ id: 'sec-1', name: 'Planning' })
        mockApi.updateSection.mockResolvedValue({ id: 'sec-1', name: 'Planning' })

        await program.parseAsync(['node', 'td', 'section', 'update', 'id:sec-1', '--stdin'])

        expect(mockApi.updateSection).toHaveBeenCalledWith('sec-1', { description: '' })
    })

    it('throws when no changes specified', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'td', 'section', 'update', 'id:sec-1']),
        ).rejects.toHaveProperty('code', 'NO_CHANGES')
    })

    it('rejects --description together with --stdin', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync([
                'node',
                'td',
                'section',
                'update',
                'id:sec-1',
                '--description',
                'x',
                '--stdin',
            ]),
        ).rejects.toHaveProperty('code', 'CONFLICTING_OPTIONS')
    })
})

describe('section --dry-run', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('section create --dry-run previews without calling API', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync([
            'node',
            'td',
            'section',
            'create',
            '--name',
            'Backlog',
            '--project',
            'Work',
            '--dry-run',
        ])

        expect(mockApi.addSection).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would create section'))
    })

    it('section delete --dry-run previews without calling API', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getSection.mockResolvedValue({
            id: 'sec-1',
            name: 'Backlog',
            projectId: 'proj-1',
            order: 1,
        })
        mockApi.getTasks.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'section', 'delete', 'id:sec-1', '--dry-run'])

        expect(mockApi.deleteSection).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would delete section'))
    })

    it('section update --dry-run previews without calling API', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync([
            'node',
            'td',
            'section',
            'update',
            'id:sec-1',
            '--name',
            'New Name',
            '--dry-run',
        ])

        expect(mockApi.updateSection).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would update section'))
    })

    it('section archive --dry-run previews without calling API', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getSection.mockResolvedValue({
            id: 'sec-1',
            name: 'Backlog',
            projectId: 'proj-1',
            order: 1,
            isArchived: false,
        })

        await program.parseAsync(['node', 'td', 'section', 'archive', 'id:sec-1', '--dry-run'])

        expect(mockApi.archiveSection).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would archive section'))
    })

    it('section unarchive --dry-run previews without calling API', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getSection.mockResolvedValue({
            id: 'sec-1',
            name: 'Backlog',
            projectId: 'proj-1',
            order: 1,
            isArchived: true,
        })

        await program.parseAsync(['node', 'td', 'section', 'unarchive', 'id:sec-1', '--dry-run'])

        expect(mockApi.unarchiveSection).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would unarchive section'))
    })
})

describe('section archive', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('rejects plain text references', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'td', 'section', 'archive', 'Planning']),
        ).rejects.toHaveProperty('code', 'INVALID_REF')
    })

    it('archives section with id: prefix', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getSection.mockResolvedValue({
            id: 'sec-123',
            name: 'My Section',
            projectId: 'proj-1',
            order: 1,
            isArchived: false,
        })
        mockApi.archiveSection.mockResolvedValue({
            id: 'sec-123',
            name: 'My Section',
            isArchived: true,
        })

        await program.parseAsync(['node', 'td', 'section', 'archive', 'id:sec-123'])

        expect(mockApi.archiveSection).toHaveBeenCalledWith('sec-123')
        expect(consoleSpy).toHaveBeenCalledWith('Archived: My Section (id:sec-123)')
    })

    it('shows message for already archived section', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getSection.mockResolvedValue({
            id: 'sec-123',
            name: 'My Section',
            projectId: 'proj-1',
            order: 1,
            isArchived: true,
        })

        await program.parseAsync(['node', 'td', 'section', 'archive', 'id:sec-123'])

        expect(mockApi.archiveSection).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith('Section already archived.')
    })
})

describe('section unarchive', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('rejects plain text references', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'td', 'section', 'unarchive', 'Planning']),
        ).rejects.toHaveProperty('code', 'INVALID_REF')
    })

    it('unarchives section with id: prefix', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getSection.mockResolvedValue({
            id: 'sec-123',
            name: 'My Section',
            projectId: 'proj-1',
            order: 1,
            isArchived: true,
        })
        mockApi.unarchiveSection.mockResolvedValue({
            id: 'sec-123',
            name: 'My Section',
            isArchived: false,
        })

        await program.parseAsync(['node', 'td', 'section', 'unarchive', 'id:sec-123'])

        expect(mockApi.unarchiveSection).toHaveBeenCalledWith('sec-123')
        expect(consoleSpy).toHaveBeenCalledWith('Unarchived: My Section (id:sec-123)')
    })

    it('shows message for non-archived section', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getSection.mockResolvedValue({
            id: 'sec-123',
            name: 'My Section',
            projectId: 'proj-1',
            order: 1,
            isArchived: false,
        })

        await program.parseAsync(['node', 'td', 'section', 'unarchive', 'id:sec-123'])

        expect(mockApi.unarchiveSection).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith('Section is not archived.')
    })
})
