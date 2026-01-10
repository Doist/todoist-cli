import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Command } from 'commander'

vi.mock('../lib/api.js', () => ({
  getApi: vi.fn(),
}))

import { getApi } from '../lib/api.js'
import { registerSectionCommand } from '../commands/section.js'

const mockGetApi = vi.mocked(getApi)

function createMockApi() {
  return {
    getProjects: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
    getProject: vi.fn(),
    getSections: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
    getSection: vi.fn(),
    addSection: vi.fn(),
    deleteSection: vi.fn(),
  }
}

function createProgram() {
  const program = new Command()
  program.exitOverride()
  registerSectionCommand(program)
  return program
}

describe('section list', () => {
  let mockApi: ReturnType<typeof createMockApi>

  beforeEach(() => {
    vi.clearAllMocks()
    mockApi = createMockApi()
    mockGetApi.mockResolvedValue(mockApi as any)
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
      expect.objectContaining({ projectId: 'proj-1' })
    )
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Planning'))
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('In Progress')
    )
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

    await program.parseAsync([
      'node',
      'td',
      'section',
      'list',
      'id:proj-1',
      '--json',
    ])

    const output = consoleSpy.mock.calls[0][0]
    const parsed = JSON.parse(output)
    expect(parsed.results).toBeDefined()
    expect(parsed.results[0].name).toBe('Planning')
    consoleSpy.mockRestore()
  })
})

describe('section create', () => {
  let mockApi: ReturnType<typeof createMockApi>

  beforeEach(() => {
    vi.clearAllMocks()
    mockApi = createMockApi()
    mockGetApi.mockResolvedValue(mockApi as any)
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
  let mockApi: ReturnType<typeof createMockApi>

  beforeEach(() => {
    vi.clearAllMocks()
    mockApi = createMockApi()
    mockGetApi.mockResolvedValue(mockApi as any)
  })

  it('requires id: prefix', async () => {
    const program = createProgram()

    await expect(
      program.parseAsync([
        'node',
        'td',
        'section',
        'delete',
        'Planning',
        '--yes',
      ])
    ).rejects.toThrow('INVALID_REF')
  })

  it('shows dry-run without --yes', async () => {
    const program = createProgram()
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    mockApi.getSection.mockResolvedValue({ id: 'sec-1', name: 'My Section' })

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
    mockApi.deleteSection.mockResolvedValue(undefined)

    await program.parseAsync([
      'node',
      'td',
      'section',
      'delete',
      'id:sec-123',
      '--yes',
    ])

    expect(mockApi.deleteSection).toHaveBeenCalledWith('sec-123')
    expect(consoleSpy).toHaveBeenCalledWith('Deleted section: My Section')
    consoleSpy.mockRestore()
  })
})
