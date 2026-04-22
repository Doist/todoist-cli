import { PassThrough } from 'node:stream'
import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/api/core.js', () => ({
    getApi: vi.fn(),
}))

vi.mock('../../lib/api/uploads.js', () => ({
    uploadFile: vi.fn().mockResolvedValue({
        resourceType: 'file',
        fileName: 'test.pdf',
        fileSize: 1024,
        fileType: 'application/pdf',
        fileUrl: 'https://cdn.todoist.com/files/test.pdf',
        uploadState: 'completed',
    }),
}))

import { getApi } from '../../lib/api/core.js'
import { uploadFile } from '../../lib/api/uploads.js'
import { createMockApi, type MockApi } from '../../test-support/mock-api.js'
import { registerCommentCommand } from './index.js'

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
                    postedAt: new Date('2026-01-08T10:00:00Z'),
                },
                {
                    id: 'comment-2',
                    content: 'Got it',
                    postedAt: new Date('2026-01-09T14:00:00Z'),
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
            results: [
                { id: 'comment-1', content: 'Note', postedAt: new Date('2026-01-08T10:00:00Z') },
            ],
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
        ).rejects.toHaveProperty('code', 'INVALID_REF')
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
        expect(consoleSpy).toHaveBeenCalledWith('Deleted comment: Test comment (id:comment-123)')
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
        ).rejects.toHaveProperty('code', 'INVALID_REF')
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
        expect(consoleSpy).toHaveBeenCalledWith('Updated comment: Old content (id:comment-123)')
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

        expect(consoleSpy).toHaveBeenCalledWith(
            `Updated comment: ${'A'.repeat(50)}... (id:comment-123)`,
        )
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
                    postedAt: new Date('2026-01-08T10:00:00Z'),
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
                    postedAt: new Date('2026-01-08T10:00:00Z'),
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
                    postedAt: new Date('2026-01-08T10:00:00Z'),
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
                    postedAt: new Date('2026-01-08T10:00:00Z'),
                    fileAttachment: { resourceType: 'file', fileName: 'doc.pdf' },
                },
                {
                    id: 'comment-2',
                    content: 'Another',
                    postedAt: new Date('2026-01-09T10:00:00Z'),
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
        ).rejects.toHaveProperty('code', 'INVALID_REF')
    })

    it('implicit view: td comment <ref> behaves like td comment view <ref>', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getComment.mockResolvedValue({
            id: 'comment-123',
            content: 'Test content',
            postedAt: new Date('2026-01-08T10:00:00Z'),
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
            postedAt: new Date('2026-01-08T10:00:00Z'),
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
            postedAt: new Date('2026-01-08T10:00:00Z'),
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
        const output = consoleSpy.mock.calls.map((call) => call[0]).join('\n')
        expect(output).not.toContain('Hint:')
        consoleSpy.mockRestore()
    })

    it('shows image-attachment hint steering agents away from direct download', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getComment.mockResolvedValue({
            id: 'comment-123',
            content: 'See mock',
            postedAt: new Date('2026-01-08T10:00:00Z'),
            fileAttachment: {
                resourceType: 'file',
                fileName: 'mock.png',
                fileSize: 22974,
                fileType: 'image/png',
                fileUrl: 'https://files.todoist.com/user_upload/v2/1/file.png',
            },
        })

        await program.parseAsync(['node', 'td', 'comment', 'view', 'id:comment-123'])

        const output = consoleSpy.mock.calls.map((call) => call[0]).join('\n')
        expect(output).toContain(
            "image attachment — fetch via 'td attachment view <url>' if needed",
        )
        expect(output).toContain('do not download and Read directly')
        consoleSpy.mockRestore()
    })

    it('shows image-attachment hint when only fileName signals the image type', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getComment.mockResolvedValue({
            id: 'comment-123',
            content: 'See mock',
            postedAt: new Date('2026-01-08T10:00:00Z'),
            fileAttachment: {
                resourceType: 'file',
                fileName: 'mock.jpg',
                fileSize: 22974,
                fileType: null,
                fileUrl: 'https://files.todoist.com/user_upload/v2/1/mock.jpg',
            },
        })

        await program.parseAsync(['node', 'td', 'comment', 'view', 'id:comment-123'])

        const output = consoleSpy.mock.calls.map((call) => call[0]).join('\n')
        expect(output).toContain('Hint:')
        expect(output).toContain('image attachment')
        consoleSpy.mockRestore()
    })

    it('omits image hint when fileUrl is missing even if fileType is an image type', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getComment.mockResolvedValue({
            id: 'comment-123',
            content: 'See mock',
            postedAt: new Date('2026-01-08T10:00:00Z'),
            fileAttachment: {
                resourceType: 'file',
                fileName: 'mock.png',
                fileSize: 22974,
                fileType: 'image/png',
                fileUrl: null,
            },
        })

        await program.parseAsync(['node', 'td', 'comment', 'view', 'id:comment-123'])

        const output = consoleSpy.mock.calls.map((call) => call[0]).join('\n')
        expect(output).not.toContain('Hint:')
        consoleSpy.mockRestore()
    })

    it('writes image hint to stderr when --json is used with an image attachment', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

        mockApi.getComment.mockResolvedValue({
            id: 'comment-123',
            content: 'See mock',
            postedAt: new Date('2026-01-08T10:00:00Z'),
            fileAttachment: {
                resourceType: 'file',
                fileName: 'mock.png',
                fileSize: 22974,
                fileType: 'image/png',
                fileUrl: 'https://files.todoist.com/user_upload/v2/1/file.png',
            },
        })

        await program.parseAsync(['node', 'td', 'comment', 'view', 'id:comment-123', '--json'])

        const stdout = consoleSpy.mock.calls[0][0] as string
        expect(() => JSON.parse(stdout)).not.toThrow()
        expect(stdout).not.toContain('Hint:')

        const stderr = stderrSpy.mock.calls.map((call) => String(call[0])).join('')
        expect(stderr).toContain('Hint:')
        expect(stderr).toContain('image attachment')

        stderrSpy.mockRestore()
        consoleSpy.mockRestore()
    })

    it('does not write to stderr when --json is used with a non-image attachment', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

        mockApi.getComment.mockResolvedValue({
            id: 'comment-123',
            content: 'See attached',
            postedAt: new Date('2026-01-08T10:00:00Z'),
            fileAttachment: {
                resourceType: 'file',
                fileName: 'document.pdf',
                fileSize: 1024000,
                fileType: 'application/pdf',
                fileUrl: 'https://cdn.todoist.com/files/document.pdf',
            },
        })

        await program.parseAsync(['node', 'td', 'comment', 'view', 'id:comment-123', '--json'])

        const stderr = stderrSpy.mock.calls.map((call) => String(call[0])).join('')
        expect(stderr).not.toContain('Hint:')

        stderrSpy.mockRestore()
        consoleSpy.mockRestore()
    })

    it('outputs JSON with --json', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getComment.mockResolvedValue({
            id: 'comment-123',
            content: 'Test content',
            postedAt: new Date('2026-01-08T10:00:00Z'),
            taskId: 'task-1',
            projectId: null,
            fileAttachment: null,
        })

        await program.parseAsync(['node', 'td', 'comment', 'view', 'id:comment-123', '--json'])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.id).toBe('comment-123')
        expect(parsed.content).toBe('Test content')
        expect(parsed.postedAt).toBe('2026-01-08T10:00:00.000Z')
        consoleSpy.mockRestore()
    })

    it('outputs full JSON with --json --full', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getComment.mockResolvedValue({
            id: 'comment-123',
            content: 'Test content',
            postedAt: new Date('2026-01-08T10:00:00Z'),
            taskId: 'task-1',
            projectId: null,
            fileAttachment: null,
            extraField: 'extra',
        })

        await program.parseAsync([
            'node',
            'td',
            'comment',
            'view',
            'id:comment-123',
            '--json',
            '--full',
        ])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.extraField).toBe('extra')
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
                    postedAt: new Date('2026-01-08T10:00:00Z'),
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

describe('comment add with --stdin', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('reads content from stdin with --stdin flag', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        const mockStdin = new PassThrough()
        const stdinSpy = vi.spyOn(process, 'stdin', 'get').mockReturnValue(mockStdin as any)

        mockApi.getTask.mockResolvedValue({ id: 'task-1', content: 'Buy milk' })
        mockApi.addComment.mockResolvedValue({
            id: 'comment-new',
            content: 'Multiline\ncontent here',
        })

        const parsePromise = program.parseAsync([
            'node',
            'td',
            'comment',
            'add',
            'id:task-1',
            '--stdin',
        ])
        mockStdin.write('Multiline\ncontent here')
        mockStdin.end()
        await parsePromise

        expect(mockApi.addComment).toHaveBeenCalledWith({
            taskId: 'task-1',
            content: 'Multiline\ncontent here',
        })
        consoleSpy.mockRestore()
        stdinSpy.mockRestore()
    })

    it('errors when both --content and --stdin are provided', async () => {
        const program = createProgram()

        mockApi.getTask.mockResolvedValue({ id: 'task-1', content: 'Buy milk' })

        await expect(
            program.parseAsync([
                'node',
                'td',
                'comment',
                'add',
                'id:task-1',
                '--content',
                'inline text',
                '--stdin',
            ]),
        ).rejects.toThrow('Cannot use both --content and --stdin')
    })

    it('works with multiline content from stdin', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        const mockStdin = new PassThrough()
        const stdinSpy = vi.spyOn(process, 'stdin', 'get').mockReturnValue(mockStdin as any)

        mockApi.getTask.mockResolvedValue({ id: 'task-1', content: 'My task' })
        mockApi.addComment.mockResolvedValue({ id: 'comment-new', content: 'line1\nline2\nline3' })

        const parsePromise = program.parseAsync([
            'node',
            'td',
            'comment',
            'add',
            'id:task-1',
            '--stdin',
        ])
        mockStdin.write('line1\n')
        mockStdin.write('line2\n')
        mockStdin.write('line3')
        mockStdin.end()
        await parsePromise

        expect(mockApi.addComment).toHaveBeenCalledWith({
            taskId: 'task-1',
            content: 'line1\nline2\nline3',
        })
        consoleSpy.mockRestore()
        stdinSpy.mockRestore()
    })
})

describe('comment add --json', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('outputs created comment as JSON', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({ id: 'task-1', content: 'Buy milk' })
        mockApi.addComment.mockResolvedValue({
            id: 'comment-new',
            content: 'Test note',
            postedAt: new Date('2026-01-08T10:00:00Z'),
            taskId: 'task-1',
            projectId: null,
            fileAttachment: null,
        })

        await program.parseAsync([
            'node',
            'td',
            'comment',
            'add',
            'id:task-1',
            '--content',
            'Test note',
            '--json',
        ])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.id).toBe('comment-new')
        expect(parsed.content).toBe('Test note')
        consoleSpy.mockRestore()
    })

    it('does not print plain-text confirmation with --json', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTask.mockResolvedValue({ id: 'task-1', content: 'Buy milk' })
        mockApi.addComment.mockResolvedValue({
            id: 'comment-new',
            content: 'Test note',
            postedAt: new Date('2026-01-08T10:00:00Z'),
            taskId: 'task-1',
        })

        await program.parseAsync([
            'node',
            'td',
            'comment',
            'add',
            'id:task-1',
            '--content',
            'Test note',
            '--json',
        ])

        expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Added comment to'))
        consoleSpy.mockRestore()
    })
})

describe('comment update --json', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('outputs updated comment as JSON', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getComment.mockResolvedValue({
            id: 'comment-123',
            content: 'Old content',
        })
        mockApi.updateComment.mockResolvedValue({
            id: 'comment-123',
            content: 'New content',
            postedAt: new Date('2026-01-08T10:00:00Z'),
            taskId: 'task-1',
        })

        await program.parseAsync([
            'node',
            'td',
            'comment',
            'update',
            'id:comment-123',
            '--content',
            'New content',
            '--json',
        ])

        const output = consoleSpy.mock.calls[0][0]
        const parsed = JSON.parse(output)
        expect(parsed.id).toBe('comment-123')
        expect(parsed.content).toBe('New content')
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

describe('comment --dry-run', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('comment add --dry-run previews without calling API', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getTasksByFilter.mockResolvedValue({
            results: [{ id: 'task-1', content: 'Test task' }],
            nextCursor: null,
        })

        await program.parseAsync([
            'node',
            'td',
            'comment',
            'add',
            'Test task',
            '--content',
            'My comment',
            '--dry-run',
        ])

        expect(mockApi.addComment).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would add comment'))
        consoleSpy.mockRestore()
    })

    it('comment delete --dry-run previews without calling API', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getComment.mockResolvedValue({ id: 'comment-1', content: 'Test comment' })

        await program.parseAsync(['node', 'td', 'comment', 'delete', 'id:comment-1', '--dry-run'])

        expect(mockApi.deleteComment).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would delete comment'))
        consoleSpy.mockRestore()
    })

    it('comment update --dry-run previews without calling API', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync([
            'node',
            'td',
            'comment',
            'update',
            'id:comment-1',
            '--content',
            'Updated text',
            '--dry-run',
        ])

        expect(mockApi.updateComment).not.toHaveBeenCalled()
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Would update comment'))
        consoleSpy.mockRestore()
    })
})

describe('comment (no args)', () => {
    it('shows parent help with examples', async () => {
        const program = createProgram()
        const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

        try {
            await program.parseAsync(['node', 'td', 'comment'])
        } catch (err: unknown) {
            if ((err as { code?: string }).code !== 'commander.help') throw err
        }

        const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
        expect(output).toContain('Examples:')
        expect(output).toContain('td comment list "Plan sprint"')
        stdoutSpy.mockRestore()
    })
})
