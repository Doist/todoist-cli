import { describe, expect, it } from 'vitest'
import { generateCodeChallenge, generateCodeVerifier, generateState } from '../lib/pkce.js'

describe('PKCE utilities', () => {
    describe('generateCodeVerifier', () => {
        it('generates a 64-character string', () => {
            const verifier = generateCodeVerifier()
            expect(verifier).toHaveLength(64)
        })

        it('only contains valid characters', () => {
            const verifier = generateCodeVerifier()
            expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/)
        })

        it('generates unique values', () => {
            const verifier1 = generateCodeVerifier()
            const verifier2 = generateCodeVerifier()
            expect(verifier1).not.toBe(verifier2)
        })
    })

    describe('generateCodeChallenge', () => {
        it('generates base64url-encoded SHA256 hash', () => {
            const verifier = 'test_verifier_1234567890'
            const challenge = generateCodeChallenge(verifier)

            // base64url has no padding and uses - and _ instead of + and /
            expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/)
        })

        it('produces consistent output for same input', () => {
            const verifier = 'consistent_verifier_123'
            const challenge1 = generateCodeChallenge(verifier)
            const challenge2 = generateCodeChallenge(verifier)
            expect(challenge1).toBe(challenge2)
        })

        it('produces different output for different input', () => {
            const challenge1 = generateCodeChallenge('verifier1')
            const challenge2 = generateCodeChallenge('verifier2')
            expect(challenge1).not.toBe(challenge2)
        })
    })

    describe('generateState', () => {
        it('generates a 32-character hex string', () => {
            const state = generateState()
            expect(state).toHaveLength(32)
            expect(state).toMatch(/^[0-9a-f]+$/)
        })

        it('generates unique values', () => {
            const state1 = generateState()
            const state2 = generateState()
            expect(state1).not.toBe(state2)
        })
    })
})
