import { afterEach, describe, expect, it, vi } from 'vitest'
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
    afterEach(() => {
        vi.restoreAllMocks()
    })

    // The CLI fix for `comment add --file` (and the two template
    // commands) is to pass the file payload to `api.uploadFile` as a
    // `Blob`. That makes the SDK take its native-`FormData` branch
    // inside `multipart-upload.js` — undici can serialize that body;
    // the SDK's Node `form-data` branch it can't. If a future change
    // ever swapped the Blob back for a Buffer / path / stream, the
    // command tests (which mock `getApi`) would all keep passing
    // while uploads silently arrived empty over the wire. This drives
    // a real `uploadFile` through the assembled api and asserts the
    // request body lands at native fetch as something undici can
    // actually serialize.
    it('serializes Blob uploads as a real multipart body (not "[object FormData]")', async () => {
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
        const blob = new Blob([new Uint8Array(Buffer.from('data'))])
        await api.uploadFile({ file: blob, fileName: 'test.bin' })

        if (!captured) throw new Error('global fetch was not called')
        // Undici turns native FormData into a multipart Request whose
        // body it later streams. A regression to passing a Buffer/path
        // would land here as the form-data package instance (or a raw
        // Buffer), which is the failure mode this test guards against.
        expect(captured.body).toBeInstanceOf(FormData)
        // Tracking headers come from createTrackedFetch.
        const headers = captured.headers as Record<string, string>
        expect(headers['doist-platform']).toBe('cli')
    })
})
