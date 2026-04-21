import { describe, expect, it } from 'vitest'
import {
    parseOAuthRedirectUris,
    serializeOAuthRedirectUris,
    validateRedirectUri,
} from './helpers.js'

describe('validateRedirectUri', () => {
    it.each([
        'https://example.com',
        'https://example.com/callback',
        'http://localhost',
        'http://localhost/callback',
        'http://localhost:3000',
        'http://localhost:24368/v1/auth/callback',
        'https://localhost:8080/path',
        'http://127.0.0.1',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:8080/callback',
        'com.example.app://callback',
        'myapp://oauth/redirect',
        'my-app.v2://auth',
        'app+test://callback',
    ])('accepts %s', (url) => {
        expect(validateRedirectUri(url)).toBe(true)
    })

    it.each([
        'not-a-url',
        // Plain http on a non-localhost host is rejected.
        'http://example.com',
        'ftp://localhost',
        '://missing-scheme',
        'javascript://alert(1)',
        'data://text/html,<h1>hi</h1>',
        'file:///etc/passwd',
        'vbscript://run',
    ])('rejects %s', (url) => {
        expect(validateRedirectUri(url)).toBe(false)
    })
})

describe('parseOAuthRedirectUris', () => {
    it.each<[string | null, string[]]>([
        ['["https://a.com/cb","https://b.com/cb"]', ['https://a.com/cb', 'https://b.com/cb']],
        ['https://example.com/callback', ['https://example.com/callback']],
        ['https://a.com/cb,https://b.com/cb', ['https://a.com/cb', 'https://b.com/cb']],
        ['https://a.com/cb , https://b.com/cb', ['https://a.com/cb', 'https://b.com/cb']],
        ['["https://a.com","","https://b.com"]', ['https://a.com', 'https://b.com']],
        [null, []],
        ['', []],
        ['  ', []],
    ])('parses %j', (input, expected) => {
        expect(parseOAuthRedirectUris(input)).toEqual(expected)
    })

    it('preserves a single valid URL whose query string contains commas', () => {
        // Without the validity pre-check, the legacy comma-fallback would
        // shred this into ['https://example.com/cb?xs=1', '2', '3'].
        const url = 'https://example.com/cb?xs=1,2,3'
        expect(parseOAuthRedirectUris(url)).toEqual([url])
    })

    it('falls back to comma-splitting only when the whole string is not a valid URI', () => {
        const input = 'https://a.com/cb,https://b.com/cb'
        expect(parseOAuthRedirectUris(input)).toEqual(['https://a.com/cb', 'https://b.com/cb'])
    })
})

describe('serializeOAuthRedirectUris', () => {
    it.each<[string[], string]>([
        [['https://example.com/callback'], 'https://example.com/callback'],
        [['https://a.com/cb', 'https://b.com/cb'], '["https://a.com/cb","https://b.com/cb"]'],
        [[], ''],
    ])('serializes %j to %s', (input, expected) => {
        expect(serializeOAuthRedirectUris(input)).toBe(expected)
    })
})
