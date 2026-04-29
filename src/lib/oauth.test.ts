import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildAuthorizationUrl, exchangeCodeForToken } from './oauth.js'
import { resetUsageTrackingForTests, setActiveCommandPath } from './usage-tracking.js'

describe('buildAuthorizationUrl', () => {
    it('uses read-write scope by default', () => {
        const url = buildAuthorizationUrl('challenge', 'state')
        const params = new URL(url).searchParams

        expect(params.get('scope')).toBe('data:read_write,data:delete,project:delete')
    })

    it('uses read-only scope when requested', () => {
        const url = buildAuthorizationUrl('challenge', 'state', { readOnly: true })
        const params = new URL(url).searchParams

        expect(params.get('scope')).toBe('data:read')
    })

    it('uses read-write scope when readOnly is false', () => {
        const url = buildAuthorizationUrl('challenge', 'state', { readOnly: false })
        const params = new URL(url).searchParams

        expect(params.get('scope')).toBe('data:read_write,data:delete,project:delete')
    })

    it('appends backups:read when the backups scope is requested', () => {
        const url = buildAuthorizationUrl('challenge', 'state', {
            additionalScopes: ['backups'],
        })
        const params = new URL(url).searchParams

        expect(params.get('scope')).toBe('data:read_write,data:delete,project:delete,backups:read')
    })

    it('appends backups:read to read-only scope when combined', () => {
        const url = buildAuthorizationUrl('challenge', 'state', {
            readOnly: true,
            additionalScopes: ['backups'],
        })
        const params = new URL(url).searchParams

        expect(params.get('scope')).toBe('data:read,backups:read')
    })

    it('combines multiple additional scopes', () => {
        const url = buildAuthorizationUrl('challenge', 'state', {
            additionalScopes: ['app-management', 'backups'],
        })
        const params = new URL(url).searchParams

        expect(params.get('scope')).toBe(
            'data:read_write,data:delete,project:delete,dev:app_console,backups:read',
        )
    })

    it('uses the specified port in redirect_uri', () => {
        const url = buildAuthorizationUrl('challenge', 'state', { port: 8767 })
        const params = new URL(url).searchParams

        expect(params.get('redirect_uri')).toBe('http://localhost:8767/callback')
    })

    it('defaults to port 8765 in redirect_uri', () => {
        const url = buildAuthorizationUrl('challenge', 'state')
        const params = new URL(url).searchParams

        expect(params.get('redirect_uri')).toBe('http://localhost:8765/callback')
    })

    afterEach(() => {
        resetUsageTrackingForTests()
        vi.unstubAllGlobals()
    })

    it('sends tracking headers during token exchange', async () => {
        setActiveCommandPath('td auth login')
        const fetchMock = vi.fn(async (_url: string | URL, options?: RequestInit) => {
            const headers = options?.headers as Record<string, string>
            expect(headers['content-type']).toBe('application/x-www-form-urlencoded')
            expect(headers['user-agent']).toMatch(/^todoist-cli\/\d+\.\d+\.\d+$/)
            expect(headers['doist-platform']).toBe('cli')
            expect(headers['doist-version']).toMatch(/^\d+\.\d+\.\d+$/)
            expect(headers['x-td-request-id']).toBeTruthy()
            expect(headers['x-td-session-id']).toBeTruthy()
            expect(headers['x-todoist-cli-command']).toBe('auth:login')
            return new Response(
                JSON.stringify({ access_token: 'token-123', token_type: 'bearer' }),
                {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                },
            )
        })
        vi.stubGlobal('fetch', fetchMock)

        await expect(exchangeCodeForToken('code-123', 'verifier-456', 8765)).resolves.toBe(
            'token-123',
        )
    })
})
