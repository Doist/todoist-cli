import { describe, expect, it, vi } from 'vitest'
import { buildRescheduleDate, createApiForToken } from './core.js'

describe('buildRescheduleDate', () => {
    it('returns date as-is when input is date-only and task has no datetime', () => {
        const result = buildRescheduleDate('2026-03-20', {
            date: '2026-03-15',
            string: 'Mar 15',
            isRecurring: false,
        })
        expect(result).toBe('2026-03-20')
    })

    it('preserves existing time when input is date-only and task has datetime', () => {
        const result = buildRescheduleDate('2026-03-20', {
            date: '2026-03-15',
            string: 'every day at 2pm',
            isRecurring: true,
            datetime: '2026-03-15T14:00:00',
        })
        expect(result).toBe('2026-03-20T14:00:00')
    })

    it('preserves existing time with timezone suffix', () => {
        const result = buildRescheduleDate('2026-03-20', {
            date: '2026-03-15',
            string: 'every day at 2pm',
            isRecurring: true,
            datetime: '2026-03-15T14:00:00Z',
        })
        expect(result).toBe('2026-03-20T14:00:00Z')
    })

    it('uses provided datetime when input includes time', () => {
        const result = buildRescheduleDate('2026-03-20T10:00:00', {
            date: '2026-03-15',
            string: 'every day at 2pm',
            isRecurring: true,
            datetime: '2026-03-15T14:00:00',
        })
        expect(result).toBe('2026-03-20T10:00:00')
    })

    it('uses provided datetime even when task has no existing time', () => {
        const result = buildRescheduleDate('2026-03-20T10:00:00', {
            date: '2026-03-15',
            string: 'Mar 15',
            isRecurring: false,
        })
        expect(result).toBe('2026-03-20T10:00:00')
    })
})

describe('createApiForToken', () => {
    // If `createApiForToken` stops wiring `createTrackedFetch` in as the
    // SDK's `customFetch`, multipart uploads silently regress: undici
    // re-applies its "[object FormData]" coercion and the file part
    // disappears. The `comment add --file` command tests mock `getApi()`
    // entirely, so they wouldn't catch that. Drive a real upload through
    // the constructed api and assert it lands at the mocked global fetch
    // as a streaming body (the shape `createTrackedFetch` produces).
    it('routes multipart uploads through createTrackedFetch (body arrives as ReadableStream)', async () => {
        let captured: RequestInit | undefined
        vi.spyOn(globalThis, 'fetch').mockImplementation((async (
            _url: RequestInfo | URL,
            options?: RequestInit,
        ) => {
            captured = options
            return new Response(
                JSON.stringify({
                    file_name: 'test.bin',
                    file_size: 4,
                    file_type: 'application/octet-stream',
                    file_url: 'https://files.todoist.com/x',
                    resource_type: 'file',
                    upload_state: 'completed',
                }),
                { status: 200, headers: { 'content-type': 'application/json' } },
            )
        }) as typeof fetch)

        const api = createApiForToken('test-token')
        await api.uploadFile({ file: Buffer.from('data'), fileName: 'test.bin' })

        if (!captured) throw new Error('global fetch was not called — customFetch not wired')
        // ReadableStream body + duplex: 'half' is the signature of
        // `createTrackedFetch`'s form-data → stream bridge. If a future
        // refactor drops `customFetch`, undici sees the raw form-data
        // instance and `captured.body` is no longer a ReadableStream.
        expect(captured.body).toBeInstanceOf(ReadableStream)
        expect((captured as RequestInit & { duplex?: string }).duplex).toBe('half')
        // Tracking headers also come from `createTrackedFetch`.
        const headers = captured.headers as Record<string, string>
        expect(headers['doist-platform']).toBe('cli')

        vi.restoreAllMocks()
    })
})
