import { describe, expect, it } from 'vitest'
import { buildAuthorizationUrl } from '../lib/oauth.js'

describe('buildAuthorizationUrl', () => {
    it('uses read-only scope when requested', () => {
        const url = buildAuthorizationUrl('challenge', 'state', { readOnly: true })
        const params = new URL(url).searchParams

        expect(params.get('scope')).toBe('data:read')
    })
})
