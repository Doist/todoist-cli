import { EventEmitter } from 'node:events'
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
    // The new multipart tests spy on `globalThis.fetch`. Restore mocks
    // between every case here so a failure in one doesn't leak a stub
    // into following tests.
    afterEach(() => {
        vi.restoreAllMocks()
    })

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

    it('streams form-data package bodies as a ReadableStream for undici fetch', async () => {
        // Minimal stub matching the duck-typed `FormDataPackage` shape that
        // `isFormDataPackageInstance` looks for. We avoid importing
        // `form-data` so this test isn't tied to that being a transitive
        // dependency of the SDK. The file part is backed by a Readable
        // stream — the higher-value failure mode (form-data's
        // `getBuffer()` can't serialize stream parts).
        class FormDataStub extends EventEmitter {
            private readonly boundary = '----test-boundary'
            constructor(private readonly fileBytes: Buffer) {
                super()
            }
            getHeaders(): Record<string, string> {
                return { 'content-type': `multipart/form-data; boundary=${this.boundary}` }
            }
            // Tripwire — the workaround must not regress to `getBuffer()`,
            // which would silently drop stream-backed parts.
            getBuffer(): Buffer {
                throw new Error('getBuffer must not be called for stream-backed parts')
            }
            pipe<T extends NodeJS.WritableStream>(dest: T): T {
                const preamble = Buffer.from(
                    `--${this.boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`,
                )
                const closer = Buffer.from(`\r\n--${this.boundary}--\r\n`)
                setImmediate(() => {
                    dest.write(preamble)
                    dest.write(this.fileBytes)
                    dest.write(closer)
                    dest.end()
                })
                return dest
            }
        }

        const fileBytes = Buffer.from('hello world bytes from a stream')
        const form = new FormDataStub(fileBytes)

        let captured: RequestInit | undefined
        // The bridge only kicks in on the native-fetch path. Mock
        // `globalThis.fetch` so the gate (`baseFetch === globalThis.fetch`)
        // matches.
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

        const trackedFetch = createTrackedFetch()

        await trackedFetch('https://api.todoist.com/api/v1/uploads', {
            method: 'POST',
            // Cast through unknown: the SDK passes a form-data instance as
            // body even though it isn't part of WHATWG BodyInit.
            body: form as unknown as BodyInit,
            headers: { ...form.getHeaders(), Authorization: 'Bearer token' },
        })

        if (!captured) throw new Error('tracked fetch did not capture request options')
        expect(captured.body).toBeInstanceOf(ReadableStream)
        // Undici requires `duplex: 'half'` to accept a streaming body.
        expect((captured as RequestInit & { duplex?: string }).duplex).toBe('half')

        // Read the stream and assert the multipart bytes (including the
        // stream-backed file content) reach `fetch` intact — undici would
        // otherwise have coerced the body to "[object FormData]".
        const reader = (captured.body as ReadableStream<Uint8Array>).getReader()
        const chunks: Uint8Array[] = []
        for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            if (value) chunks.push(value)
        }
        const body = Buffer.concat(chunks.map((c) => Buffer.from(c)))
        expect(body.includes(fileBytes)).toBe(true)
        expect(body.toString('utf8')).toContain('Content-Disposition: form-data')

        const headers = captured.headers as Record<string, string>
        expect(headers['content-type']).toMatch(/^multipart\/form-data; boundary=/)
    })

    it('passes form-data bodies through unchanged for non-native fetch transports', async () => {
        // The bridge is only safe for undici's native fetch. Custom
        // transports (test stubs, alternate clients) receive the form
        // as-is so they aren't forced into stream-body semantics.
        let captured: RequestInit | undefined
        const trackedFetch = createTrackedFetch(async (_url, options) => {
            captured = options
            return new Response('{}', {
                status: 200,
                headers: { 'content-type': 'application/json' },
            })
        })

        const form = {
            getHeaders: () => ({ 'content-type': 'multipart/form-data; boundary=x' }),
            pipe: <T>(dest: T) => dest,
            on: () => undefined,
        }

        await trackedFetch('https://api.todoist.com/api/v1/uploads', {
            method: 'POST',
            body: form as unknown as BodyInit,
            headers: form.getHeaders(),
        })

        expect(captured?.body).toBe(form)
        expect((captured as RequestInit & { duplex?: string }).duplex).toBeUndefined()
    })

    it('maps form-data stream fs errors to a structured CliError', async () => {
        const fsError = Object.assign(new Error('ENOENT: no such file or directory'), {
            code: 'ENOENT',
            path: '/tmp/does-not-exist',
        })

        class FailingFormData extends EventEmitter {
            getHeaders() {
                return { 'content-type': 'multipart/form-data; boundary=x' }
            }
            pipe<T extends NodeJS.WritableStream>(dest: T): T {
                // Surface the fs error via the standard form-data mechanism:
                // emit 'error' on the form itself, which the bridge wires
                // through to the PassThrough.
                setImmediate(() => this.emit('error', fsError))
                return dest
            }
        }

        vi.spyOn(globalThis, 'fetch').mockImplementation((async (
            _url: RequestInfo | URL,
            options?: RequestInit,
        ) => {
            // Drain the body so the upstream error actually propagates.
            if (!options?.body) throw new Error('missing body on mocked fetch')
            const reader = (options.body as ReadableStream<Uint8Array>).getReader()
            try {
                for (;;) {
                    const { done } = await reader.read()
                    if (done) break
                }
            } catch (err) {
                // undici would surface this with `cause: fsError`; mimic
                // that wrapping so the mapper has something to walk.
                throw Object.assign(new TypeError('fetch failed'), { cause: err })
            }
            return new Response('{}', { status: 200 })
        }) as typeof fetch)

        const trackedFetch = createTrackedFetch()
        const form = new FailingFormData()

        await expect(
            trackedFetch('https://api.todoist.com/api/v1/uploads', {
                method: 'POST',
                body: form as unknown as BodyInit,
                headers: form.getHeaders(),
            }),
        ).rejects.toMatchObject({
            code: 'FILE_NOT_FOUND',
            message: expect.stringContaining('/tmp/does-not-exist'),
        })
    })

    it('honors an already-aborted signal without starting the upload', async () => {
        let pipeCalled = false
        const fetchSpy = vi.spyOn(globalThis, 'fetch')

        const form = {
            getHeaders: () => ({ 'content-type': 'multipart/form-data; boundary=x' }),
            pipe: <T>(dest: T) => {
                pipeCalled = true
                return dest
            },
            on: () => undefined,
        }

        const controller = new AbortController()
        controller.abort(new Error('canceled by user'))

        const trackedFetch = createTrackedFetch()
        await expect(
            trackedFetch('https://api.todoist.com/api/v1/uploads', {
                method: 'POST',
                body: form as unknown as BodyInit,
                headers: form.getHeaders(),
                signal: controller.signal,
            }),
        ).rejects.toThrow(/canceled by user/)

        // Critical: an already-aborted upload must not open the local
        // file or hit the network. `form.pipe()` would put a real
        // form-data into flowing mode and `fs.createReadStream` would
        // start reading.
        expect(pipeCalled).toBe(false)
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('cancels an in-flight multipart upload when its signal aborts', async () => {
        // Simulate undici: drain the body, observe the abort signal,
        // reject when the upstream stream errors out.
        vi.spyOn(globalThis, 'fetch').mockImplementation((async (
            _url: RequestInfo | URL,
            options?: RequestInit,
        ) => {
            if (!options?.body) throw new Error('missing body')
            const reader = (options.body as ReadableStream<Uint8Array>).getReader()
            for (;;) {
                const { done } = await reader.read()
                if (done) break
            }
            return new Response('{}', { status: 200 })
        }) as typeof fetch)

        // A form that streams forever — until the PassThrough is
        // destroyed by the abort handler.
        const form = {
            getHeaders: () => ({ 'content-type': 'multipart/form-data; boundary=x' }),
            pipe<T extends NodeJS.WritableStream>(dest: T): T {
                let cancelled = false
                ;(dest as unknown as { on: (e: string, l: () => void) => void }).on('close', () => {
                    cancelled = true
                })
                const tick = (): void => {
                    if (cancelled || (dest as unknown as { destroyed?: boolean }).destroyed) return
                    dest.write('chunk\r\n')
                    setImmediate(tick)
                }
                setImmediate(tick)
                return dest
            },
            on: () => undefined,
        }

        const controller = new AbortController()
        const trackedFetch = createTrackedFetch()
        const promise = trackedFetch('https://api.todoist.com/api/v1/uploads', {
            method: 'POST',
            body: form as unknown as BodyInit,
            headers: form.getHeaders(),
            signal: controller.signal,
        })

        // Abort once the stream is producing data.
        setImmediate(() => controller.abort(new Error('mid-flight abort')))

        await expect(promise).rejects.toThrow()
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
