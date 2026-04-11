import { describe, expect, it } from 'vitest'
import { buildAuthorizationUrl } from '../lib/oauth.js'

describe('buildAuthorizationUrl', () => {
    it('uses read-write scope by default', () => {
        const url = buildAuthorizationUrl('challenge', 'state')
        const params = new URL(url).searchParams

        expect(params.get('scope')).toBe('data:read_write,data:delete,project:delete,backups:read')
    })

    it('uses read-only scope when requested', () => {
        const url = buildAuthorizationUrl('challenge', 'state', { readOnly: true })
        const params = new URL(url).searchParams

        expect(params.get('scope')).toBe('data:read,backups:read')
    })

    it('uses read-write scope when readOnly is false', () => {
        const url = buildAuthorizationUrl('challenge', 'state', { readOnly: false })
        const params = new URL(url).searchParams

        expect(params.get('scope')).toBe('data:read_write,data:delete,project:delete,backups:read')
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
})
