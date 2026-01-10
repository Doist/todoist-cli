import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Command } from 'commander'

vi.mock('../lib/api.js', () => ({
  getApi: vi.fn(),
}))

import { getApi } from '../lib/api.js'
import { registerCommentCommand } from '../commands/comment.js'

const mockGetApi = vi.mocked(getApi)

function createMockApi() {
  return {
    getTasks: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
    getTask: vi.fn(),
    getComments: vi.fn().mockResolvedValue({ results: [], nextCursor: null }),
    getComment: vi.fn(),
    addComment: vi.fn(),
    deleteComment: vi.fn(),
  }
}

function createProgram() {
  const program = new Command()
  program.exitOverride()
  registerCommentCommand(program)
  return program
}

describe('comment list', () => {
  let mockApi: ReturnType<typeof createMockApi>

  beforeEach(() => {
    vi.clearAllMocks()
    mockApi = createMockApi()
    mockGetApi.mockResolvedValue(mockApi as any)
  })

  it('resolves task and lists comments', async () => {
    const program = createProgram()
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    mockApi.getTask.mockResolvedValue({ id: 'task-1', content: 'Buy milk' })
    mockApi.getComments.mockResolvedValue({
      results: [
        {
          id: 'comment-1',
          content: 'Remember organic',
          postedAt: '2026-01-08T10:00:00Z',
        },
        {
          id: 'comment-2',
          content: 'Got it',
          postedAt: '2026-01-09T14:00:00Z',
        },
      ],
      nextCursor: null,
    })

    await program.parseAsync(['node', 'td', 'comment', 'list', 'id:task-1'])

    expect(mockApi.getComments).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task-1' })
    )
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Remember organic')
    )
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Got it'))
    consoleSpy.mockRestore()
  })

  it('shows "No comments" when empty', async () => {
    const program = createProgram()
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    mockApi.getTask.mockResolvedValue({ id: 'task-1', content: 'Test' })
    mockApi.getComments.mockResolvedValue({ results: [], nextCursor: null })

    await program.parseAsync(['node', 'td', 'comment', 'list', 'id:task-1'])

    expect(consoleSpy).toHaveBeenCalledWith('No comments.')
    consoleSpy.mockRestore()
  })

  it('outputs JSON with --json flag', async () => {
    const program = createProgram()
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    mockApi.getTask.mockResolvedValue({ id: 'task-1', content: 'Test' })
    mockApi.getComments.mockResolvedValue({
      results: [
        { id: 'comment-1', content: 'Note', postedAt: '2026-01-08T10:00:00Z' },
      ],
      nextCursor: null,
    })

    await program.parseAsync([
      'node',
      'td',
      'comment',
      'list',
      'id:task-1',
      '--json',
    ])

    const output = consoleSpy.mock.calls[0][0]
    const parsed = JSON.parse(output)
    expect(parsed.results).toBeDefined()
    expect(parsed.results[0].content).toBe('Note')
    consoleSpy.mockRestore()
  })

  it('resolves task by name', async () => {
    const program = createProgram()
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    mockApi.getTasks.mockResolvedValue({
      results: [{ id: 'task-1', content: 'Buy milk' }],
      nextCursor: null,
    })
    mockApi.getComments.mockResolvedValue({ results: [], nextCursor: null })

    await program.parseAsync(['node', 'td', 'comment', 'list', 'Buy milk'])

    expect(mockApi.getComments).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task-1' })
    )
    consoleSpy.mockRestore()
  })
})

describe('comment add', () => {
  let mockApi: ReturnType<typeof createMockApi>

  beforeEach(() => {
    vi.clearAllMocks()
    mockApi = createMockApi()
    mockGetApi.mockResolvedValue(mockApi as any)
  })

  it('adds comment to task', async () => {
    const program = createProgram()
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    mockApi.getTask.mockResolvedValue({ id: 'task-1', content: 'Buy milk' })
    mockApi.addComment.mockResolvedValue({
      id: 'comment-new',
      content: 'Get 2%',
    })

    await program.parseAsync([
      'node',
      'td',
      'comment',
      'add',
      'id:task-1',
      '--content',
      'Get 2%',
    ])

    expect(mockApi.addComment).toHaveBeenCalledWith({
      taskId: 'task-1',
      content: 'Get 2%',
    })
    expect(consoleSpy).toHaveBeenCalledWith('Added comment to "Buy milk"')
    consoleSpy.mockRestore()
  })

  it('shows comment ID after creation', async () => {
    const program = createProgram()
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    mockApi.getTask.mockResolvedValue({ id: 'task-1', content: 'Test' })
    mockApi.addComment.mockResolvedValue({
      id: 'comment-xyz',
      content: 'Note',
    })

    await program.parseAsync([
      'node',
      'td',
      'comment',
      'add',
      'id:task-1',
      '--content',
      'Note',
    ])

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('comment-xyz')
    )
    consoleSpy.mockRestore()
  })
})

describe('comment delete', () => {
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
        'comment',
        'delete',
        'comment-1',
        '--yes',
      ])
    ).rejects.toThrow('INVALID_REF')
  })

  it('shows dry-run without --yes', async () => {
    const program = createProgram()
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    mockApi.getComment.mockResolvedValue({
      id: 'comment-1',
      content: 'Test comment',
    })

    await program.parseAsync([
      'node',
      'td',
      'comment',
      'delete',
      'id:comment-1',
    ])

    expect(mockApi.deleteComment).not.toHaveBeenCalled()
    expect(consoleSpy).toHaveBeenCalledWith(
      'Would delete comment: Test comment'
    )
    expect(consoleSpy).toHaveBeenCalledWith('Use --yes to confirm.')
    consoleSpy.mockRestore()
  })

  it('deletes comment with id: prefix and --yes', async () => {
    const program = createProgram()
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    mockApi.getComment.mockResolvedValue({
      id: 'comment-123',
      content: 'Test comment',
    })
    mockApi.deleteComment.mockResolvedValue(undefined)

    await program.parseAsync([
      'node',
      'td',
      'comment',
      'delete',
      'id:comment-123',
      '--yes',
    ])

    expect(mockApi.deleteComment).toHaveBeenCalledWith('comment-123')
    expect(consoleSpy).toHaveBeenCalledWith('Deleted comment: Test comment')
    consoleSpy.mockRestore()
  })
})
