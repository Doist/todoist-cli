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
        expect(headers['X-TD-Request-Id']).toBeTruthy()
        expect(headers['X-TD-Session-Id']).toBeTruthy()
        expect(headers['X-TD-CLI-Command']).toBe('task:view')
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
        expect(firstHeaders['x-td-cli-command']).toBe('today')
        expect(firstHeaders['x-td-session-id']).toBe(secondHeaders['x-td-session-id'])
        expect(firstHeaders['x-td-request-id']).not.toBe(secondHeaders['x-td-request-id'])
        expect(response.ok).toBe(true)
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
        afterEach(() => {
            getDefaultDispatcherMock.mockReset()
            getDefaultDispatcherMock.mockResolvedValue(undefined)
        })

        it('attaches the env proxy dispatcher when createTrackedFetch uses native fetch', async () => {
            const fakeDispatcher = { kind: 'env-http-proxy-agent' } as unknown as NonNullable<
                Awaited<ReturnType<typeof getDefaultDispatcher>>
            >
            getDefaultDispatcherMock.mockResolvedValue(fakeDispatcher)

            let captured: RequestInit | undefined
            const originalFetch = globalThis.fetch
            globalThis.fetch = (async (_url: RequestInfo | URL, options?: RequestInit) => {
                captured = options
                return new Response('{}', {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                })
            }) as typeof fetch

            try {
                const trackedFetch = createTrackedFetch()
                await trackedFetch('https://api.todoist.com/api/v1/tasks', { method: 'GET' })
            } finally {
                globalThis.fetch = originalFetch
            }

            expect(getDefaultDispatcherMock).toHaveBeenCalled()
            expect(captured).toBeTruthy()
            // dispatcher is a Node fetch extension not present in RequestInit types
            expect((captured as unknown as { dispatcher?: unknown }).dispatcher).toBe(
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
            const fakeDispatcher = { kind: 'env-http-proxy-agent' } as unknown as NonNullable<
                Awaited<ReturnType<typeof getDefaultDispatcher>>
            >
            getDefaultDispatcherMock.mockResolvedValue(fakeDispatcher)

            let captured: RequestInit | undefined
            const originalFetch = globalThis.fetch
            globalThis.fetch = (async (_url: RequestInfo | URL, options?: RequestInit) => {
                captured = options
                return new Response('{}', {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                })
            }) as typeof fetch

            try {
                await fetchTodoist('https://api.todoist.com/api/v1/user', {
                    headers: { Authorization: 'Bearer token' },
                })
            } finally {
                globalThis.fetch = originalFetch
            }

            expect(getDefaultDispatcherMock).toHaveBeenCalled()
            expect((captured as unknown as { dispatcher?: unknown }).dispatcher).toBe(
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
        expect(headers['x-td-cli-command']).toBe('postinstall:auth-migrate')
    })
})
