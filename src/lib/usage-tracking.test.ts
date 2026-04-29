import { describe, expect, it } from 'vitest'
import {
    buildUsageTrackingHeaders,
    createTrackedFetch,
    detectAiAgent,
    normalizeCommandPath,
    resetUsageTrackingForTests,
    setActiveCommandPath,
} from './usage-tracking.js'

describe('usage tracking', () => {
    it('normalizes commander command paths into header-friendly values', () => {
        expect(normalizeCommandPath('td task view')).toBe('task.view')
        expect(normalizeCommandPath('td today')).toBe('today')
    })

    it('builds cli tracking headers with command metadata', () => {
        resetUsageTrackingForTests()
        setActiveCommandPath('td task view')

        const headers = buildUsageTrackingHeaders()

        expect(headers['User-Agent']).toMatch(/^todoist-cli\/\d+\.\d+\.\d+$/)
        expect(headers['X-Todoist-Client']).toBe('todoist-cli')
        expect(headers['X-Todoist-CLI-Version']).toMatch(/^\d+\.\d+\.\d+$/)
        expect(headers['X-Todoist-CLI-Invocation-Id']).toBeTruthy()
        expect(headers['X-Todoist-CLI-Command']).toBe('task.view')
    })

    it('detects known ai agents from environment variables', () => {
        expect(detectAiAgent({ CLAUDECODE: '1' })).toBe('claude_code')
        expect(detectAiAgent({ CODEX_THREAD_ID: 'thread_123' })).toBe('codex_cli')
        expect(detectAiAgent({})).toBeUndefined()
    })

    it('injects tracking headers into sdk custom fetch requests', async () => {
        resetUsageTrackingForTests()
        setActiveCommandPath('td today')

        let captured: RequestInit | undefined
        const trackedFetch = createTrackedFetch(async (_url, options) => {
            captured = options
            return new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            })
        })

        const response = await trackedFetch('https://api.todoist.com/api/v1/tasks', {
            method: 'GET',
            headers: { Authorization: 'Bearer token' },
        })

        expect(captured).toBeTruthy()
        if (!captured) {
            throw new Error('tracked fetch did not capture request options')
        }
        const headers = captured.headers as Record<string, string>
        expect(headers.authorization).toBe('Bearer token')
        expect(headers['x-todoist-cli-command']).toBe('today')
        expect(response.ok).toBe(true)
    })
})
