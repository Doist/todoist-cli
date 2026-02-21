import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api/core.js', () => ({
    getApi: vi.fn(),
}))

vi.mock('../lib/api/uploads.js', () => ({
    uploadFile: vi.fn().mockResolvedValue({
        resourceType: 'file',
        fileName: 'test.pdf',
        fileSize: 1024,
        fileType: 'application/pdf',
        fileUrl: 'https://cdn.todoist.com/files/test.pdf',
        uploadState: 'completed',
    }),
}))

import { registerCommentCommand } from '../commands/comment.js'
import { getApi } from '../lib/api/core.js'
import { uploadFile } from '../lib/api/uploads.js'
import { createMockApi, type MockApi } from './helpers/mock-api.js'

const mockGetApi = vi.mocked(getApi)
const mockUploadFile = vi.mocked(uploadFile)

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerCommentCommand(program)
    return program
}

describe('comment list', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
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
            expect.objectContaining({ taskId: 'task-1' }),
        )
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Remember organic'))
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
            results: [{ id: 'comment-1', content: 'Note', postedAt: '2026-01-08T10:00:00Z' }],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'comment', 'list', 'id:task-1', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.results).toBeDefined()
        expect(parsed.results[0].content).toBe('Note')
        consoleSpy.mockRestore()
    })

    it('resolves task by name', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTasksByFilter.mockResolvedValue({
            results: [{ id: 'task-1', content: 'Buy milk' }],
            nextCursor: null,
        })
        mockApi.getComments.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'comment', 'list', 'Buy milk'])

        expect(mockApi.getComments).toHaveBeenCalledWith(
            expect.objectContaining({ taskId: 'task-1' }),
        )
        consoleSpy.mockRestore()
    })
})

describe('comment add', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
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

        await program.parseAsync(['node', 'td', 'comment', 'add', 'id:task-1', '--content', 'Note'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('comment-xyz'))
        consoleSpy.mockRestore()
    })
})

describe('comment delete', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('rejects plain text references', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'td', 'comment', 'delete', 'my-comment', '--yes']),
        ).rejects.toThrow('INVALID_REF')
    })

    it('shows dry-run without --yes', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getComment.mockResolvedValue({
            id: 'comment-1',
            content: 'Test comment',
        })

        await program.parseAsync(['node', 'td', 'comment', 'delete', 'id:comment-1'])

        expect(mockApi.deleteComment).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith('Would delete comment: Test comment')
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

        await program.parseAsync(['node', 'td', 'comment', 'delete', 'id:comment-123', '--yes'])

        expect(mockApi.deleteComment).toHaveBeenCalledWith('comment-123')
        expect(consoleSpy).toHaveBeenCalledWith('Deleted comment: Test comment')
        consoleSpy.mockRestore()
    })
})

describe('comment update', () => {
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
                'comment',
                'update',
                'my-comment',
                '--content',
                'New text',
            ]),
        ).rejects.toThrow('INVALID_REF')
    })

    it('updates comment content', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getComment.mockResolvedValue({
            id: 'comment-123',
            content: 'Old content',
        })
        mockApi.updateComment.mockResolvedValue({
            id: 'comment-123',
            content: 'New content',
        })

        await program.parseAsync([
            'node',
            'td',
            'comment',
            'update',
            'id:comment-123',
            '--content',
            'New content',
        ])

        expect(mockApi.updateComment).toHaveBeenCalledWith('comment-123', {
            content: 'New content',
        })
        expect(consoleSpy).toHaveBeenCalledWith('Updated comment: Old content')
        consoleSpy.mockRestore()
    })

    it('truncates long content in output', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        const longContent = 'A'.repeat(60)
        mockApi.getComment.mockResolvedValue({
            id: 'comment-123',
            content: longContent,
        })
        mockApi.updateComment.mockResolvedValue({
            id: 'comment-123',
            content: 'New content',
        })

        await program.parseAsync([
            'node',
            'td',
            'comment',
            'update',
            'id:comment-123',
            '--content',
            'New content',
        ])

        expect(consoleSpy).toHaveBeenCalledWith(`Updated comment: ${'A'.repeat(50)}...`)
        consoleSpy.mockRestore()
    })
})

describe('comment add with attachment', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('uploads file and attaches to comment', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({ id: 'task-1', content: 'Buy milk' })
        mockApi.addComment.mockResolvedValue({
            id: 'comment-new',
            content: 'See attached',
        })

        await program.parseAsync([
            'node',
            'td',
            'comment',
            'add',
            'id:task-1',
            '--content',
            'See attached',
            '--file',
            '/path/to/file.pdf',
        ])

        expect(mockUploadFile).toHaveBeenCalledWith('/path/to/file.pdf')
        expect(mockApi.addComment).toHaveBeenCalledWith({
            taskId: 'task-1',
            content: 'See attached',
            attachment: {
                fileUrl: 'https://cdn.todoist.com/files/test.pdf',
                fileName: 'test.pdf',
                fileType: 'application/pdf',
                resourceType: 'file',
            },
        })
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Attached: test.pdf'))
        consoleSpy.mockRestore()
    })

    it('works without --file flag', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({ id: 'task-1', content: 'Buy milk' })
        mockApi.addComment.mockResolvedValue({
            id: 'comment-new',
            content: 'Just text',
        })

        await program.parseAsync([
            'node',
            'td',
            'comment',
            'add',
            'id:task-1',
            '--content',
            'Just text',
        ])

        expect(mockUploadFile).not.toHaveBeenCalled()
        expect(mockApi.addComment).toHaveBeenCalledWith({
            taskId: 'task-1',
            content: 'Just text',
        })
        consoleSpy.mockRestore()
    })
})

describe('comment list with attachments', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('shows [file] marker for comments with attachments', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({ id: 'task-1', content: 'Test' })
        mockApi.getComments.mockResolvedValue({
            results: [
                {
                    id: 'comment-1',
                    content: 'See attached',
                    postedAt: '2026-01-08T10:00:00Z',
                    fileAttachment: {
                        resourceType: 'file',
                        fileName: 'doc.pdf',
                        fileUrl: 'https://cdn.todoist.com/files/doc.pdf',
                    },
                },
            ],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'comment', 'list', 'id:task-1'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[file]'))
        consoleSpy.mockRestore()
    })

    it('truncates long content to default 3 lines', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({ id: 'task-1', content: 'Test' })
        mockApi.getComments.mockResolvedValue({
            results: [
                {
                    id: 'comment-1',
                    content: 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5',
                    postedAt: '2026-01-08T10:00:00Z',
                    fileAttachment: null,
                },
            ],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'comment', 'list', 'id:task-1'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Line 1'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Line 2'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Line 3'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('...'))
        consoleSpy.mockRestore()
    })

    it('respects --lines flag', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({ id: 'task-1', content: 'Test' })
        mockApi.getComments.mockResolvedValue({
            results: [
                {
                    id: 'comment-1',
                    content: 'Line 1\nLine 2\nLine 3',
                    postedAt: '2026-01-08T10:00:00Z',
                    fileAttachment: null,
                },
            ],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'comment', 'list', 'id:task-1', '--lines', '1'])

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Line 1'))
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('...'))
        consoleSpy.mockRestore()
    })

    it('includes hasAttachment in JSON output', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({ id: 'task-1', content: 'Test' })
        mockApi.getComments.mockResolvedValue({
            results: [
                {
                    id: 'comment-1',
                    content: 'Note',
                    postedAt: '2026-01-08T10:00:00Z',
                    fileAttachment: { resourceType: 'file', fileName: 'doc.pdf' },
                },
                {
                    id: 'comment-2',
                    content: 'Another',
                    postedAt: '2026-01-09T10:00:00Z',
                    fileAttachment: null,
                },
            ],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'comment', 'list', 'id:task-1', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.results[0].hasAttachment).toBe(true)
        expect(parsed.results[1].hasAttachment).toBe(false)
        consoleSpy.mockRestore()
    })
})

describe('comment view', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('rejects plain text references', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'td', 'comment', 'view', 'my-comment']),
        ).rejects.toThrow('INVALID_REF')
    })

    it('implicit view: td comment <ref> behaves like td comment view <ref>', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getComment.mockResolvedValue({
            id: 'comment-123',
            content: 'Test content',
            postedAt: '2026-01-08T10:00:00Z',
            fileAttachment: null,
        })

        await program.parseAsync(['node', 'td', 'comment', 'id:comment-123'])

        expect(mockApi.getComment).toHaveBeenCalledWith('comment-123')
        consoleSpy.mockRestore()
    })

    it('shows full comment content', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getComment.mockResolvedValue({
            id: 'comment-123',
            content: 'Full content here\nWith multiple lines\nNo truncation',
            postedAt: '2026-01-08T10:00:00Z',
            fileAttachment: null,
        })

        await program.parseAsync(['node', 'td', 'comment', 'view', 'id:comment-123'])

        expect(mockApi.getComment).toHaveBeenCalledWith('comment-123')
        expect(consoleSpy).toHaveBeenCalledWith(
            'Full content here\nWith multiple lines\nNo truncation',
        )
        consoleSpy.mockRestore()
    })

    it('shows attachment details', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getComment.mockResolvedValue({
            id: 'comment-123',
            content: 'See attached',
            postedAt: '2026-01-08T10:00:00Z',
            fileAttachment: {
                resourceType: 'file',
                fileName: 'document.pdf',
                fileSize: 1024000,
                fileType: 'application/pdf',
                fileUrl: 'https://cdn.todoist.com/files/document.pdf',
            },
        })

        await program.parseAsync(['node', 'td', 'comment', 'view', 'id:comment-123'])

        expect(consoleSpy).toHaveBeenCalledWith('  Name:  document.pdf')
        expect(consoleSpy).toHaveBeenCalledWith('  Size:  1000.0 KB')
        expect(consoleSpy).toHaveBeenCalledWith('  Type:  application/pdf')
        expect(consoleSpy).toHaveBeenCalledWith(
            '  URL:   https://cdn.todoist.com/files/document.pdf',
        )
        consoleSpy.mockRestore()
    })
})

describe('project comment list', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('lists comments on a project with --project flag', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getProject.mockResolvedValue({ id: 'proj-1', name: 'Work' })
        mockApi.getComments.mockResolvedValue({
            results: [
                {
                    id: 'comment-1',
                    content: 'Project note',
                    postedAt: '2026-01-08T10:00:00Z',
                    fileAttachment: null,
                },
            ],
            nextCursor: null,
        })

        await program.parseAsync(['node', 'td', 'comment', 'list', 'id:proj-1', '--project'])

        expect(mockApi.getComments).toHaveBeenCalledWith(
            expect.objectContaining({ projectId: 'proj-1' }),
        )
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Project note'))
        consoleSpy.mockRestore()
    })

    it('resolves project by name with --project flag', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getProjects.mockResolvedValue({
            results: [{ id: 'proj-1', name: 'Work' }],
            nextCursor: null,
        })
        mockApi.getComments.mockResolvedValue({ results: [], nextCursor: null })

        await program.parseAsync(['node', 'td', 'comment', 'list', 'Work', '--project'])

        expect(mockApi.getComments).toHaveBeenCalledWith(
            expect.objectContaining({ projectId: 'proj-1' }),
        )
        consoleSpy.mockRestore()
    })
})

describe('project comment add', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('adds comment to project with --project flag', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getProject.mockResolvedValue({ id: 'proj-1', name: 'Work' })
        mockApi.addComment.mockResolvedValue({
            id: 'comment-new',
            content: 'Project note',
        })

        await program.parseAsync([
            'node',
            'td',
            'comment',
            'add',
            'id:proj-1',
            '--project',
            '--content',
            'Project note',
        ])

        expect(mockApi.addComment).toHaveBeenCalledWith({
            projectId: 'proj-1',
            content: 'Project note',
        })
        expect(consoleSpy).toHaveBeenCalledWith('Added comment to "Work"')
        consoleSpy.mockRestore()
    })

    it('adds comment with attachment to project', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getProject.mockResolvedValue({ id: 'proj-1', name: 'Work' })
        mockApi.addComment.mockResolvedValue({
            id: 'comment-new',
            content: 'See attached',
        })

        await program.parseAsync([
            'node',
            'td',
            'comment',
            'add',
            'id:proj-1',
            '--project',
            '--content',
            'See attached',
            '--file',
            '/path/to/file.pdf',
        ])

        expect(mockUploadFile).toHaveBeenCalledWith('/path/to/file.pdf')
        expect(mockApi.addComment).toHaveBeenCalledWith({
            projectId: 'proj-1',
            content: 'See attached',
            attachment: {
                fileUrl: 'https://cdn.todoist.com/files/test.pdf',
                fileName: 'test.pdf',
                fileType: 'application/pdf',
                resourceType: 'file',
            },
        })
        consoleSpy.mockRestore()
    })
})
