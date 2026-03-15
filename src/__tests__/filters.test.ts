import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api/filters.js', () => ({
    fetchFilters: vi.fn(),
}))

import { registerFiltersCommand } from '../commands/filters.js'
import { fetchFilters } from '../lib/api/filters.js'
import { makeFilter } from './helpers/fixtures.js'

const mockFetchFilters = vi.mocked(fetchFilters)

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerFiltersCommand(program)
    return program
}

describe('filters list', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('lists all filters', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Work tasks', query: '@work' }),
            makeFilter({ id: 'filter-2', name: 'Urgent', query: 'p1', isFavorite: true }),
        ])

        await program.parseAsync(['node', 'td', 'filters', 'list'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Work tasks'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Urgent'))
        consoleSpy.mockRestore()
    })

    it('lists filters as default subcommand', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Work tasks', query: '@work' }),
        ])

        await program.parseAsync(['node', 'td', 'filters'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Work tasks'))
        consoleSpy.mockRestore()
    })

    it('shows "No filters found" when empty', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchFilters.mockResolvedValue([])

        await program.parseAsync(['node', 'td', 'filters', 'list'])

        expect(consoleSpy).toHaveBeenCalledWith('No filters found.')
        consoleSpy.mockRestore()
    })

    it('outputs JSON with --json flag', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Work', query: '@work' }),
        ])

        await program.parseAsync(['node', 'td', 'filters', 'list', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.results).toBeDefined()
        expect(parsed.results[0].name).toBe('Work')
        expect(parsed.nextCursor).toBeNull()
        consoleSpy.mockRestore()
    })

    it('outputs NDJSON with --ndjson flag', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockFetchFilters.mockResolvedValue([
            makeFilter({ id: 'filter-1', name: 'Work', query: '@work' }),
            makeFilter({ id: 'filter-2', name: 'Home', query: '@home' }),
        ])

        await program.parseAsync(['node', 'td', 'filters', 'list', '--ndjson'])

        const output = consoleSpy.mock.calls[0][0]
        const lines = output.split('\n').filter(Boolean)
        expect(lines.length).toBe(2)
        expect(JSON.parse(lines[0]).name).toBe('Work')
        expect(JSON.parse(lines[1]).name).toBe('Home')
        consoleSpy.mockRestore()
    })
})
