import { describe, expect, it } from 'vitest'
import {
    buildUsageTrackingHeaders,
    createTrackedFetch,
    fetchTodoist,
    normalizeCommandPath,
    resetUsageTrackingForTests,
    setActiveCommandPath,
} from './usage-tracking.js'

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
        expect(headers['X-Todoist-CLI-Command']).toBe('task:view')
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
        expect(firstHeaders['x-todoist-cli-command']).toBe('today')
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
        expect(headers['x-todoist-cli-command']).toBe('postinstall:auth-migrate')
    })
})
