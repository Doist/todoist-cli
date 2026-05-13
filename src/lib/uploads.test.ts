import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { uploadAttachment } from './uploads.js'

const UPLOAD_RESPONSE_BODY = {
    file_name: 'sample.txt',
    file_size: 12,
    file_type: 'text/plain',
    file_url: 'https://files.todoist.com/user_upload/v2/1/file.txt',
    image: null,
    image_height: null,
    image_width: null,
    resource_type: 'file',
    upload_state: 'completed',
}

describe('uploadAttachment', () => {
    let tmpDir: string

    beforeEach(async () => {
        tmpDir = await mkdtemp(join(tmpdir(), 'td-uploads-test-'))
    })

    afterEach(async () => {
        await rm(tmpDir, { recursive: true, force: true })
        vi.restoreAllMocks()
    })

    it('POSTs a multipart upload with the file bytes and camelCases the response', async () => {
        const filePath = join(tmpDir, 'sample.txt')
        await writeFile(filePath, 'hello world!')

        let capturedUrl: string | URL | undefined
        let capturedOptions: RequestInit | undefined
        vi.spyOn(globalThis, 'fetch').mockImplementation((async (
            url: RequestInfo | URL,
            options?: RequestInit,
        ) => {
            capturedUrl = url as string | URL
            capturedOptions = options
            return new Response(JSON.stringify(UPLOAD_RESPONSE_BODY), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            })
        }) as typeof fetch)

        const result = await uploadAttachment({ file: filePath }, 'test-token')

        expect(String(capturedUrl)).toBe('https://api.todoist.com/api/v1/uploads')
        expect(capturedOptions?.method).toBe('POST')
        // Native fetch handles WHATWG FormData; the SDK doesn't see this path.
        expect(capturedOptions?.body).toBeInstanceOf(FormData)
        const sentForm = capturedOptions?.body as FormData
        expect(sentForm.get('file_name')).toBe('sample.txt')
        const sentFile = sentForm.get('file') as Blob | null
        expect(sentFile).toBeInstanceOf(Blob)
        expect(await sentFile?.text()).toBe('hello world!')

        const headers = capturedOptions?.headers as Record<string, string>
        expect(headers.authorization).toBe('Bearer test-token')

        // The whole point of the bypass: snake_case → camelCase fields populated.
        expect(result).toMatchObject({
            resourceType: 'file',
            fileName: 'sample.txt',
            fileSize: 12,
            fileType: 'text/plain',
            fileUrl: 'https://files.todoist.com/user_upload/v2/1/file.txt',
            uploadState: 'completed',
        })
    })

    it('passes a Buffer + filename through as a Blob', async () => {
        let capturedOptions: RequestInit | undefined
        vi.spyOn(globalThis, 'fetch').mockImplementation((async (
            _url: RequestInfo | URL,
            options?: RequestInit,
        ) => {
            capturedOptions = options
            return new Response(JSON.stringify(UPLOAD_RESPONSE_BODY), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            })
        }) as typeof fetch)

        await uploadAttachment({ file: Buffer.from('buffer payload'), fileName: 'note.txt' }, 'tok')

        const sentForm = capturedOptions?.body as FormData
        expect(sentForm.get('file_name')).toBe('note.txt')
        expect(await (sentForm.get('file') as Blob).text()).toBe('buffer payload')
    })

    it('surfaces the HTTP body when the upload fails', async () => {
        const filePath = join(tmpDir, 'bad.txt')
        await writeFile(filePath, 'x')

        vi.spyOn(globalThis, 'fetch').mockImplementation((async () => {
            return new Response('{"error":"too big"}', {
                status: 413,
                statusText: 'Payload Too Large',
                headers: { 'content-type': 'application/json' },
            })
        }) as typeof fetch)

        await expect(uploadAttachment({ file: filePath }, 'tok')).rejects.toThrow(
            /HTTP 413 Payload Too Large.*too big/,
        )
    })
})
