import type { FileResponse } from '@doist/todoist-sdk'
import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api/core.js', () => ({
    getApi: vi.fn(),
}))

import { registerAttachmentCommand } from '../commands/attachment.js'
import { getApi } from '../lib/api/core.js'
import { createMockApi, type MockApi } from './helpers/mock-api.js'

const mockGetApi = vi.mocked(getApi)

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerAttachmentCommand(program)
    return program
}

function createMockResponse({
    ok = true,
    status = 200,
    statusText = 'OK',
    contentType = 'application/octet-stream',
    contentLength,
    body,
}: {
    ok?: boolean
    status?: number
    statusText?: string
    contentType?: string
    contentLength?: string
    body?: ArrayBuffer | string
}): FileResponse {
    const headers: Record<string, string> = { 'content-type': contentType }
    if (contentLength) {
        headers['content-length'] = contentLength
    }

    const bodyBuffer =
        typeof body === 'string'
            ? new TextEncoder().encode(body).buffer
            : (body ?? new ArrayBuffer(0))

    const bodyText = typeof body === 'string' ? body : ''

    return {
        ok,
        status,
        statusText,
        headers,
        arrayBuffer: vi.fn().mockResolvedValue(bodyBuffer),
        text: vi.fn().mockResolvedValue(bodyText),
        json: vi.fn().mockResolvedValue({}),
    }
}

describe('attachment view', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('calls api.viewAttachment with the URL', async () => {
        const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
        const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
        mockApi.viewAttachment.mockResolvedValue(
            createMockResponse({ contentType: 'text/plain', body: 'hello' }),
        )

        const program = createProgram()
        await program.parseAsync([
            'node',
            'td',
            'attachment',
            'view',
            'https://files.todoist.com/file.txt',
        ])

        expect(mockApi.viewAttachment).toHaveBeenCalledWith('https://files.todoist.com/file.txt')
        stdoutSpy.mockRestore()
        stderrSpy.mockRestore()
    })

    describe('text files', () => {
        it('outputs text content to stdout without trailing newline', async () => {
            const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
            const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
            mockApi.viewAttachment.mockResolvedValue(
                createMockResponse({ contentType: 'text/plain', body: 'Hello, world!' }),
            )

            const program = createProgram()
            await program.parseAsync([
                'node',
                'td',
                'attachment',
                'view',
                'https://files.todoist.com/notes.txt',
            ])

            expect(stdoutSpy).toHaveBeenCalledWith('Hello, world!')
            expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('notes.txt'))
            expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('text/plain'))
            stdoutSpy.mockRestore()
            stderrSpy.mockRestore()
        })

        it('handles JSON files as text', async () => {
            const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
            const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
            const jsonContent = '{"key": "value"}'
            mockApi.viewAttachment.mockResolvedValue(
                createMockResponse({ contentType: 'application/json', body: jsonContent }),
            )

            const program = createProgram()
            await program.parseAsync([
                'node',
                'td',
                'attachment',
                'view',
                'https://files.todoist.com/data.json',
            ])

            expect(stdoutSpy).toHaveBeenCalledWith(jsonContent)
            stdoutSpy.mockRestore()
            stderrSpy.mockRestore()
        })
    })

    describe('image files', () => {
        it('outputs base64 for PNG files', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
            const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
            const imageData = new Uint8Array([137, 80, 78, 71]).buffer
            mockApi.viewAttachment.mockResolvedValue(
                createMockResponse({ contentType: 'image/png', body: imageData }),
            )

            const program = createProgram()
            await program.parseAsync([
                'node',
                'td',
                'attachment',
                'view',
                'https://files.todoist.com/photo.png',
            ])

            const base64 = Buffer.from(imageData).toString('base64')
            expect(consoleSpy).toHaveBeenCalledWith(base64)
            expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('base64'))
            consoleSpy.mockRestore()
            stderrSpy.mockRestore()
        })
    })

    describe('binary files', () => {
        it('outputs base64 for PDF files', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
            const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
            const pdfData = new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer
            mockApi.viewAttachment.mockResolvedValue(
                createMockResponse({ contentType: 'application/pdf', body: pdfData }),
            )

            const program = createProgram()
            await program.parseAsync([
                'node',
                'td',
                'attachment',
                'view',
                'https://files.todoist.com/doc.pdf',
            ])

            const base64 = Buffer.from(pdfData).toString('base64')
            expect(consoleSpy).toHaveBeenCalledWith(base64)
            consoleSpy.mockRestore()
            stderrSpy.mockRestore()
        })
    })

    describe('--json output', () => {
        it('returns JSON with utf-8 encoding for text files', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
            const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
            mockApi.viewAttachment.mockResolvedValue(
                createMockResponse({ contentType: 'text/plain', body: 'hello world' }),
            )

            const program = createProgram()
            await program.parseAsync([
                'node',
                'td',
                'attachment',
                'view',
                'https://files.todoist.com/notes.txt',
                '--json',
            ])

            const output = JSON.parse(consoleSpy.mock.calls[0][0])
            expect(output).toMatchObject({
                fileName: 'notes.txt',
                contentType: 'text/plain',
                contentCategory: 'text',
                encoding: 'utf-8',
                content: 'hello world',
            })
            expect(output.fileSize).toBe(Buffer.byteLength('hello world', 'utf-8'))
            consoleSpy.mockRestore()
            stderrSpy.mockRestore()
        })

        it('returns JSON with base64 encoding for binary files', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
            const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
            const pdfData = new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer
            mockApi.viewAttachment.mockResolvedValue(
                createMockResponse({ contentType: 'application/pdf', body: pdfData }),
            )

            const program = createProgram()
            await program.parseAsync([
                'node',
                'td',
                'attachment',
                'view',
                'https://files.todoist.com/doc.pdf',
                '--json',
            ])

            const output = JSON.parse(consoleSpy.mock.calls[0][0])
            expect(output).toMatchObject({
                fileName: 'doc.pdf',
                contentType: 'application/pdf',
                contentCategory: 'binary',
                encoding: 'base64',
            })
            expect(output.content).toBe(Buffer.from(pdfData).toString('base64'))
            consoleSpy.mockRestore()
            stderrSpy.mockRestore()
        })
    })

    describe('content-type handling', () => {
        it('strips charset from content-type', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
            const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
            mockApi.viewAttachment.mockResolvedValue(
                createMockResponse({
                    contentType: 'text/plain; charset=utf-8',
                    body: 'hello',
                }),
            )

            const program = createProgram()
            await program.parseAsync([
                'node',
                'td',
                'attachment',
                'view',
                'https://files.todoist.com/file.txt',
                '--json',
            ])

            const output = JSON.parse(consoleSpy.mock.calls[0][0])
            expect(output.contentType).toBe('text/plain')
            consoleSpy.mockRestore()
            stderrSpy.mockRestore()
        })

        it('falls back to URL extension when content-type is application/octet-stream', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
            const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
            mockApi.viewAttachment.mockResolvedValue(
                createMockResponse({
                    contentType: 'application/octet-stream',
                    body: new ArrayBuffer(4),
                }),
            )

            const program = createProgram()
            await program.parseAsync([
                'node',
                'td',
                'attachment',
                'view',
                'https://files.todoist.com/photo.png',
                '--json',
            ])

            const output = JSON.parse(consoleSpy.mock.calls[0][0])
            expect(output.contentType).toBe('image/png')
            expect(output.contentCategory).toBe('image')
            consoleSpy.mockRestore()
            stderrSpy.mockRestore()
        })
    })

    describe('error handling', () => {
        it('throws on non-ok response', async () => {
            mockApi.viewAttachment.mockResolvedValue(
                createMockResponse({ ok: false, status: 404, statusText: 'Not Found' }),
            )

            const program = createProgram()
            await expect(
                program.parseAsync([
                    'node',
                    'td',
                    'attachment',
                    'view',
                    'https://files.todoist.com/missing.txt',
                ]),
            ).rejects.toThrow('404 Not Found')
        })

        it('throws when content-length exceeds 10MB', async () => {
            const largeSize = (11 * 1024 * 1024).toString()
            mockApi.viewAttachment.mockResolvedValue(
                createMockResponse({
                    contentType: 'image/png',
                    contentLength: largeSize,
                }),
            )

            const program = createProgram()
            await expect(
                program.parseAsync([
                    'node',
                    'td',
                    'attachment',
                    'view',
                    'https://files.todoist.com/huge.png',
                ]),
            ).rejects.toThrow('too large')
        })

        it('throws when body exceeds 10MB without content-length', async () => {
            const largeBody = new ArrayBuffer(11 * 1024 * 1024)
            mockApi.viewAttachment.mockResolvedValue(
                createMockResponse({
                    contentType: 'image/png',
                    body: largeBody,
                }),
            )

            const program = createProgram()
            await expect(
                program.parseAsync([
                    'node',
                    'td',
                    'attachment',
                    'view',
                    'https://files.todoist.com/huge.png',
                ]),
            ).rejects.toThrow('too large')
        })
    })

    describe('charset handling', () => {
        it('uses declared charset for text decoding', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
            const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
            mockApi.viewAttachment.mockResolvedValue(
                createMockResponse({
                    contentType: 'text/plain; charset=utf-8',
                    body: 'hello',
                }),
            )

            const program = createProgram()
            await program.parseAsync([
                'node',
                'td',
                'attachment',
                'view',
                'https://files.todoist.com/file.txt',
                '--json',
            ])

            const output = JSON.parse(consoleSpy.mock.calls[0][0])
            expect(output.encoding).toBe('utf-8')
            expect(output.content).toBe('hello')
            consoleSpy.mockRestore()
            stderrSpy.mockRestore()
        })

        it('reports declared charset in encoding field', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
            const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
            mockApi.viewAttachment.mockResolvedValue(
                createMockResponse({
                    contentType: 'text/plain; charset=iso-8859-1',
                    body: 'hello',
                }),
            )

            const program = createProgram()
            await program.parseAsync([
                'node',
                'td',
                'attachment',
                'view',
                'https://files.todoist.com/file.txt',
                '--json',
            ])

            const output = JSON.parse(consoleSpy.mock.calls[0][0])
            expect(output.encoding).toBe('iso-8859-1')
            consoleSpy.mockRestore()
            stderrSpy.mockRestore()
        })
    })

    describe('filename handling', () => {
        it('decodes URL-encoded filenames', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
            const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
            mockApi.viewAttachment.mockResolvedValue(
                createMockResponse({ contentType: 'text/plain', body: 'content' }),
            )

            const program = createProgram()
            await program.parseAsync([
                'node',
                'td',
                'attachment',
                'view',
                'https://files.todoist.com/my%20file%20(1).txt',
                '--json',
            ])

            const output = JSON.parse(consoleSpy.mock.calls[0][0])
            expect(output.fileName).toBe('my file (1).txt')
            consoleSpy.mockRestore()
            stderrSpy.mockRestore()
        })
    })

    describe('default subcommand', () => {
        it('td attachment <url> works as td attachment view <url>', async () => {
            const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
            const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
            mockApi.viewAttachment.mockResolvedValue(
                createMockResponse({ contentType: 'text/plain', body: 'content' }),
            )

            const program = createProgram()
            await program.parseAsync([
                'node',
                'td',
                'attachment',
                'https://files.todoist.com/file.txt',
            ])

            expect(mockApi.viewAttachment).toHaveBeenCalledWith(
                'https://files.todoist.com/file.txt',
            )
            stdoutSpy.mockRestore()
            stderrSpy.mockRestore()
        })
    })
})
