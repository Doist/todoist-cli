import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api/core.js', () => ({
    getApi: vi.fn(),
}))

import { registerSectionCommand } from '../commands/section.js'
import { getApi } from '../lib/api/core.js'
import { createMockApi, type MockApi } from './helpers/mock-api.js'

const mockGetApi = vi.mocked(getApi)

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerSectionCommand(program)
    return program
}

describe('section list', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('resolves project and lists sections', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

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
        consoleSpy.mockRestore()
    })

    it('shows "No sections" when empty', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getProject.mockResolvedValue({ id: 'proj-1', name: 'Work' })
        mockApi.getSections.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'section', 'list', 'id:proj-1'])

        expect(consoleSpy).toHaveBeenCalledWith('No sections.')
        consoleSpy.mockRestore()
    })

    it('outputs JSON with --json flag', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

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
        consoleSpy.mockRestore()
    })

    it('accepts --project flag instead of positional arg', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })
        mockApi.getSections.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'section', 'list', '--project', 'Work'])

        expect(mockApi.getSections).toHaveBeenCalledWith(
            expect.objectContaining({ projectId: 'proj-1' }),
        )
        consoleSpy.mockRestore()
    })

    it('errors when both positional and --project are provided', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'td', 'section', 'list', 'Work', '--project', 'Personal']),
        ).rejects.toThrow('Cannot specify project both as argument and --project flag')
    })
})

describe('section create --json', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('outputs created section as JSON', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getProject.mockResolvedValue({ id: 'proj-1', name: 'Work' })
        mockApi.addSection.mockResolvedValue({
            id: 'sec-new',
            name: 'New Section',
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
        expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Created:'))
        consoleSpy.mockRestore()
    })
})

describe('section update --json', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('outputs updated section as JSON', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getSection.mockResolvedValue({ id: 'sec-1', name: 'Old Name', projectId: 'proj-1' })
        mockApi.updateSection.mockResolvedValue({
            id: 'sec-1',
            name: 'New Name',
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
        expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Updated:'))
        consoleSpy.mockRestore()
    })
})

describe('section create', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('creates section in project', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

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
        consoleSpy.mockRestore()
    })

    it('shows section ID after creation', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

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
        consoleSpy.mockRestore()
    })
})

describe('section delete', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('rejects plain text references', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'td', 'section', 'delete', 'Planning', '--yes']),
        ).rejects.toThrow('INVALID_REF')
    })

    it('shows dry-run without --yes', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getSection.mockResolvedValue({ id: 'sec-1', name: 'My Section' })
        mockApi.getTasks.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'section', 'delete', 'id:sec-1'])

        expect(mockApi.deleteSection).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith('Would delete section: My Section')
        expect(consoleSpy).toHaveBeenCalledWith('Use --yes to confirm.')
        consoleSpy.mockRestore()
    })

    it('deletes section with id: prefix and --yes', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getSection.mockResolvedValue({ id: 'sec-123', name: 'My Section' })
        mockApi.getTasks.mockResolvedValue({ results: [], nextCursor: null })
        mockApi.deleteSection.mockResolvedValue(undefined)

        await program.parseAsync(['node', 'td', 'section', 'delete', 'id:sec-123', '--yes'])

        expect(mockApi.deleteSection).toHaveBeenCalledWith('sec-123')
        expect(consoleSpy).toHaveBeenCalledWith('Deleted section: My Section')
        consoleSpy.mockRestore()
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
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
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
        ).rejects.toThrow('INVALID_REF')
    })

    it('updates section name', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

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
        expect(consoleSpy).toHaveBeenCalledWith('Updated: Old Name → New Name')
        consoleSpy.mockRestore()
    })
})

describe('section --dry-run', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('section create --dry-run previews without calling API', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

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
        consoleSpy.mockRestore()
    })

    it('section delete --dry-run previews without calling API', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'td', 'section', 'delete', 'id:sec-1', '--dry-run'])

        expect(mockApi.deleteSection).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would delete section'))
        consoleSpy.mockRestore()
    })

    it('section update --dry-run previews without calling API', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

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
        consoleSpy.mockRestore()
    })
})
