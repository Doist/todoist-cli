import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { getDefaultDispatcher } from '@doist/todoist-sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    buildUsageTrackingHeaders,
    createTrackedFetch,
    fetchTodoist,
    normalizeCommandPath,
    resetUsageTrackingForTests,
    setActiveCommandPath,
} from './usage-tracking.js'

vi.mock('@doist/todoist-sdk', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@doist/todoist-sdk')>()
    return {
        ...actual,
        getDefaultDispatcher: vi.fn(() => Promise.resolve(undefined)),
    }
})

const getDefaultDispatcherMock = vi.mocked(getDefaultDispatcher)

describe('usage tracking', () => {
    it('normalizes commander command paths into header-friendly values', () => {
        expect(normalizeCommandPath('td task view')).toBe('task:view')
        expect(normalizeCommandPath('td today')).toBe('today')
    })

    it('builds cli tracking headers with command metadata', () => {
        resetUsageTrackingForTests()
        setActiveCommandPath('td task view')

        const headers = buildUsageTrackingHeaders()

        expect(headers['User-Agent']).toMatch(/^todoist-cli\/\d+\.\d+\.\d+$/)
        expect(headers['doist-platform']).toBe('cli')
        expect(headers['doist-version']).toMatch(/^\d+\.\d+\.\d+$/)
        expect(headers['doist-os']).toMatch(/^(macos|linux|windows|unknown)$/)
        expect(headers['request-id']).toBeTruthy()
        expect(headers['session-id']).toBeTruthy()
        expect(headers['cli-command']).toBe('task:view')
    })

    it('injects tracking headers into sdk custom fetch requests', async () => {
        resetUsageTrackingForTests()
        setActiveCommandPath('td today')

        const captured: RequestInit[] = []
        const trackedFetch = createTrackedFetch(async (_url, options) => {
            captured.push(options ?? {})
            return new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            })
        })

        await trackedFetch('https://api.todoist.com/api/v1/tasks', {
            method: 'GET',
            headers: { Authorization: 'Bearer token' },
        })
        const response = await trackedFetch('https://api.todoist.com/api/v1/tasks', {
            method: 'GET',
            headers: { Authorization: 'Bearer token' },
        })

        expect(captured).toHaveLength(2)
        const firstHeaders = captured[0].headers as Record<string, string>
        const secondHeaders = captured[1].headers as Record<string, string>
        expect(firstHeaders.authorization).toBe('Bearer token')
        expect(firstHeaders['doist-platform']).toBe('cli')
        expect(firstHeaders['doist-version']).toMatch(/^\d+\.\d+\.\d+$/)
        expect(firstHeaders['cli-command']).toBe('today')
        expect(firstHeaders['session-id']).toBe(secondHeaders['session-id'])
        expect(firstHeaders['request-id']).not.toBe(secondHeaders['request-id'])
        expect(response.ok).toBe(true)
    })

    it('materializes form-data package bodies into a Buffer for undici fetch', async () => {
        // Minimal stub matching the duck-typed `FormDataPackage` shape that
        // `isFormDataPackageInstance` looks for. We avoid importing
        // `form-data` so this test isn't tied to that being a transitive
        // dependency of the SDK, and we deliberately back the `file` part
        // with a Readable stream — the higher-value failure mode, since
        // form-data's `getBuffer()` doesn't serialize stream parts. If the
        // fix regressed to a `getBuffer()`-based implementation, the
        // tripwire on `getBuffer` below would catch it.
        class FormDataStub extends EventEmitter {
            private readonly boundary = '----test-boundary'
            constructor(private readonly fileBytes: Buffer) {
                super()
            }
            getHeaders(): Record<string, string> {
                return { 'content-type': `multipart/form-data; boundary=${this.boundary}` }
            }
            getBuffer(): Buffer {
                throw new Error('getBuffer must not be called for stream-backed parts')
            }
            pipe(): unknown {
                return this
            }
            resume(): void {
                const preamble = Buffer.from(
                    `--${this.boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`,
                )
                const closer = Buffer.from(`\r\n--${this.boundary}--\r\n`)
                this.emit('data', preamble)
                const source = Readable.from([this.fileBytes])
                source.on('data', (chunk: Buffer) => this.emit('data', chunk))
                source.once('end', () => {
                    this.emit('data', closer)
                    this.emit('end')
                })
                source.once('error', (err: Error) => this.emit('error', err))
            }
        }

        const fileBytes = Buffer.from('hello world bytes from a stream')
        const form = new FormDataStub(fileBytes)

        let captured: RequestInit | undefined
        const trackedFetch = createTrackedFetch(async (_url, options) => {
            captured = options
            return new Response('{}', {
                status: 200,
                headers: { 'content-type': 'application/json' },
            })
        })

        await trackedFetch('https://api.todoist.com/api/v1/uploads', {
            method: 'POST',
            // Cast through unknown: the SDK passes a form-data instance as
            // body even though it isn't part of WHATWG BodyInit.
            body: form as unknown as BodyInit,
            headers: { ...form.getHeaders(), Authorization: 'Bearer token' },
        })

        if (!captured) throw new Error('tracked fetch did not capture request options')
        expect(captured.body).toBeInstanceOf(Buffer)
        const body = captured.body as Buffer
        // The stream contents must survive serialization — this is the
        // bug we're guarding against (undici otherwise coerces the body
        // to "[object FormData]" and the file bytes vanish).
        expect(body.includes(fileBytes)).toBe(true)
        expect(body.toString('utf8')).toContain('Content-Disposition: form-data')
        const headers = captured.headers as Record<string, string>
        expect(headers['content-type']).toMatch(/^multipart\/form-data; boundary=/)
    })

    it('maps sdk timeouts to abort signals', async () => {
        let captured: RequestInit | undefined
        const trackedFetch = createTrackedFetch(async (_url, options) => {
            captured = options
            return new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            })
        })

        await trackedFetch('https://api.todoist.com/api/v1/tasks', {
            method: 'GET',
            timeout: 250,
        })

        expect(captured?.signal).toBeInstanceOf(AbortSignal)
        expect(captured?.signal?.aborted).toBe(false)

        await new Promise((resolve) => setTimeout(resolve, 300))

        expect(captured?.signal?.aborted).toBe(true)
    })

    it('combines sdk timeouts with existing abort signals', async () => {
        const abortController = new AbortController()

        let captured: RequestInit | undefined
        const trackedFetch = createTrackedFetch(async (_url, options) => {
            captured = options
            return new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            })
        })

        await trackedFetch('https://api.todoist.com/api/v1/tasks', {
            method: 'GET',
            signal: abortController.signal,
            timeout: 250,
        })

        expect(captured?.signal).toBeInstanceOf(AbortSignal)
        expect(captured?.signal).not.toBe(abortController.signal)
        expect(captured?.signal?.aborted).toBe(false)

        abortController.abort()

        expect(captured?.signal?.aborted).toBe(true)
    })

    describe('proxy dispatcher injection', () => {
        const fakeDispatcher = { kind: 'env-http-proxy-agent' } as unknown as NonNullable<
            Awaited<ReturnType<typeof getDefaultDispatcher>>
        >

        afterEach(() => {
            vi.restoreAllMocks()
            getDefaultDispatcherMock.mockReset()
            getDefaultDispatcherMock.mockResolvedValue(undefined)
        })

        function spyOnNativeFetch(): () => RequestInit | undefined {
            let captured: RequestInit | undefined
            vi.spyOn(globalThis, 'fetch').mockImplementation((async (
                _url: RequestInfo | URL,
                options?: RequestInit,
            ) => {
                captured = options
                return new Response('{}', {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                })
            }) as typeof fetch)
            return () => captured
        }

        it('attaches the env proxy dispatcher when createTrackedFetch uses native fetch', async () => {
            getDefaultDispatcherMock.mockResolvedValue(fakeDispatcher)
            const getCaptured = spyOnNativeFetch()

            const trackedFetch = createTrackedFetch()
            await trackedFetch('https://api.todoist.com/api/v1/tasks', { method: 'GET' })

            expect(getDefaultDispatcherMock).toHaveBeenCalled()
            // dispatcher is a Node fetch extension not present in RequestInit types
            expect((getCaptured() as unknown as { dispatcher?: unknown }).dispatcher).toBe(
                fakeDispatcher,
            )
        })

        it('does not attach a dispatcher when createTrackedFetch is given a stub', async () => {
            let captured: RequestInit | undefined
            const trackedFetch = createTrackedFetch(async (_url, options) => {
                captured = options
                return new Response('{}', {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                })
            })

            await trackedFetch('https://api.todoist.com/api/v1/tasks', { method: 'GET' })

            expect(getDefaultDispatcherMock).not.toHaveBeenCalled()
            expect(captured).toBeTruthy()
            expect((captured as unknown as { dispatcher?: unknown }).dispatcher).toBeUndefined()
        })

        it('attaches the env proxy dispatcher when fetchTodoist uses native fetch', async () => {
            getDefaultDispatcherMock.mockResolvedValue(fakeDispatcher)
            const getCaptured = spyOnNativeFetch()

            await fetchTodoist('https://api.todoist.com/api/v1/user', {
                headers: { Authorization: 'Bearer token' },
            })

            expect(getDefaultDispatcherMock).toHaveBeenCalled()
            expect((getCaptured() as unknown as { dispatcher?: unknown }).dispatcher).toBe(
                fakeDispatcher,
            )
        })

        it('does not attach a dispatcher when fetchTodoist is given a stub', async () => {
            let captured: RequestInit | undefined
            const fetchImpl: typeof fetch = async (_url, options) => {
                captured = options
                return new Response('{}', {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                })
            }

            await fetchTodoist(
                'https://api.todoist.com/api/v1/user',
                { headers: { Authorization: 'Bearer token' } },
                fetchImpl,
            )

            expect(getDefaultDispatcherMock).not.toHaveBeenCalled()
            expect((captured as unknown as { dispatcher?: unknown }).dispatcher).toBeUndefined()
        })
    })

    it('supports explicit command overrides for non-command direct fetches', async () => {
        let captured: RequestInit | undefined
        const fetchImpl: typeof fetch = async (
            _url: RequestInfo | URL,
            options?: RequestInit,
        ): Promise<Response> => {
            captured = options
            return new Response('{}', {
                status: 200,
                headers: { 'content-type': 'application/json' },
            })
        }

        await fetchTodoist(
            'https://api.todoist.com/api/v1/user',
            { headers: { Authorization: 'Bearer token' } },
            fetchImpl,
            'postinstall:auth-migrate',
        )

        expect(captured).toBeTruthy()
        if (!captured) throw new Error('direct fetch did not capture request options')
        const headers = captured.headers as Record<string, string>
        expect(headers.authorization).toBe('Bearer token')
        expect(headers['cli-command']).toBe('postinstall:auth-migrate')
    })
})
