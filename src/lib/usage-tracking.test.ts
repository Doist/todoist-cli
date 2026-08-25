import { getDefaultTransport } from '@doist/todoist-sdk'
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
        getDefaultTransport: vi.fn(() => Promise.resolve(undefined)),
    }
})

const getDefaultTransportMock = vi.mocked(getDefaultTransport)

describe('usage tracking', () => {
    it('normalizes commander command paths into header-friendly values', () => {
        expect(normalizeCommandPath('td task view')).toBe('task:view')
        expect(normalizeCommandPath('td today')).toBe('today')
    })

    it('builds cli tracking headers with command metadata', () => {
        resetUsageTrackingForTests()
        setActiveCommandPath('td task view')

        const headers = buildUsageTrackingHeaders()

        expect(headers['User-Agent']).toMatch(/^todoist-cli\/\d+\.\d+\.\d+(-[\w.]+)?$/)
        expect(headers['doist-platform']).toBe('cli')
        expect(headers['doist-version']).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/)
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
        expect(firstHeaders['doist-version']).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/)
        expect(firstHeaders['cli-command']).toBe('today')
        expect(firstHeaders['session-id']).toBe(secondHeaders['session-id'])
        expect(firstHeaders['request-id']).not.toBe(secondHeaders['request-id'])
        expect(response.ok).toBe(true)
    })

    it('forwards arrayBuffer so binary attachments are not corrupted', async () => {
        // PNG magic + a stretch of high bytes that would be replaced with
        // U+FFFD by any UTF-8 text round-trip on the response body.
        const binaryBytes = new Uint8Array([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0xff, 0xfe,
            0xfd, 0x80,
        ])
        const trackedFetch = createTrackedFetch(
            async () =>
                new Response(binaryBytes, {
                    status: 200,
                    headers: { 'content-type': 'image/png' },
                }),
        )

        const response = await trackedFetch('https://files.todoist.com/file.png')
        const buffer = await response.arrayBuffer?.()

        expect(buffer).toBeDefined()
        if (buffer) {
            expect(new Uint8Array(buffer)).toEqual(binaryBytes)
        }
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
        type Transport = NonNullable<Awaited<ReturnType<typeof getDefaultTransport>>>
        const fakeDispatcher = {
            kind: 'env-http-proxy-agent',
        } as unknown as Transport['dispatcher']

        afterEach(() => {
            vi.restoreAllMocks()
            getDefaultTransportMock.mockReset()
            getDefaultTransportMock.mockResolvedValue(undefined)
        })

        /**
         * Stands in for the SDK's transport: a fetch of our own, paired with a
         * dispatcher, exactly as undici's own fetch is paired in production.
         */
        function stubPairedTransport(): {
            getCaptured: () => RequestInit | undefined
            pairedFetch: ReturnType<typeof vi.fn>
        } {
            let captured: RequestInit | undefined
            const pairedFetch = vi.fn(async (_url: RequestInfo | URL, options?: RequestInit) => {
                captured = options
                return new Response('{}', {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                })
            })
            getDefaultTransportMock.mockResolvedValue({
                dispatcher: fakeDispatcher,
                fetch: pairedFetch as unknown as Transport['fetch'],
            })
            return { getCaptured: () => captured, pairedFetch }
        }

        /**
         * Left without an implementation on purpose. If the transport pairing
         * ever regresses to the global fetch, this makes a real network call
         * and the test fails loudly instead of passing against a stub.
         */
        function spyOnGlobalFetch() {
            return vi.spyOn(globalThis, 'fetch')
        }

        it('sends createTrackedFetch requests through the fetch paired with the dispatcher', async () => {
            const globalFetchSpy = spyOnGlobalFetch()
            const { getCaptured, pairedFetch } = stubPairedTransport()

            const trackedFetch = createTrackedFetch()
            await trackedFetch('https://api.todoist.com/api/v1/tasks', { method: 'GET' })

            expect(getDefaultTransportMock).toHaveBeenCalled()
            expect(pairedFetch).toHaveBeenCalled()
            // The dispatcher decompresses the body itself, so it must never be
            // handed to a fetch it was not paired with.
            expect(globalFetchSpy).not.toHaveBeenCalled()
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

            expect(getDefaultTransportMock).not.toHaveBeenCalled()
            expect(captured).toBeTruthy()
            expect((captured as unknown as { dispatcher?: unknown }).dispatcher).toBeUndefined()
        })

        it('sends fetchTodoist requests through the fetch paired with the dispatcher', async () => {
            const globalFetchSpy = spyOnGlobalFetch()
            const { getCaptured, pairedFetch } = stubPairedTransport()

            await fetchTodoist('https://api.todoist.com/api/v1/user', {
                headers: { Authorization: 'Bearer token' },
            })

            expect(getDefaultTransportMock).toHaveBeenCalled()
            expect(pairedFetch).toHaveBeenCalled()
            expect(globalFetchSpy).not.toHaveBeenCalled()
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

            expect(getDefaultTransportMock).not.toHaveBeenCalled()
            expect((captured as unknown as { dispatcher?: unknown }).dispatcher).toBeUndefined()
        })

        it('uses the global fetch when the transport has no fetch of its own', async () => {
            // Bun reports Node but ships a partial undici: the SDK returns a
            // dispatcher with no paired fetch, and the global fetch is then the
            // correct partner because Bun decompresses natively.
            let captured: RequestInit | undefined
            const globalFetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((async (
                _url: RequestInfo | URL,
                options?: RequestInit,
            ) => {
                captured = options
                return new Response('{}', {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                })
            }) as typeof fetch)
            getDefaultTransportMock.mockResolvedValue({
                dispatcher: fakeDispatcher,
                fetch: undefined,
            })

            await createTrackedFetch()('https://api.todoist.com/api/v1/tasks', { method: 'GET' })

            expect(globalFetchSpy).toHaveBeenCalled()
            expect((captured as unknown as { dispatcher?: unknown }).dispatcher).toBe(
                fakeDispatcher,
            )
        })

        it('uses the global fetch and no dispatcher outside Node', async () => {
            let captured: RequestInit | undefined
            const globalFetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((async (
                _url: RequestInfo | URL,
                options?: RequestInit,
            ) => {
                captured = options
                return new Response('{}', {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                })
            }) as typeof fetch)
            getDefaultTransportMock.mockResolvedValue(undefined)

            await createTrackedFetch()('https://api.todoist.com/api/v1/tasks', { method: 'GET' })

            expect(globalFetchSpy).toHaveBeenCalled()
            expect((captured as unknown as { dispatcher?: unknown }).dispatcher).toBeUndefined()
        })

        it('leaves a dispatcher the caller chose in place', async () => {
            const ownDispatcher = { kind: 'caller-supplied' }
            const { getCaptured, pairedFetch } = stubPairedTransport()

            await fetchTodoist('https://api.todoist.com/api/v1/user', {
                // dispatcher is a Node fetch extension not present in RequestInit types
                dispatcher: ownDispatcher,
            } as RequestInit)

            expect(pairedFetch).toHaveBeenCalled()
            expect((getCaptured() as unknown as { dispatcher?: unknown }).dispatcher).toBe(
                ownDispatcher,
            )
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
