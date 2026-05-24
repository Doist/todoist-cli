import { describe, expect, it } from 'vitest'
import type { Config } from './config.js'
import { getEffectiveDefaultUser, getEffectiveDefaultUserId } from './users.js'

describe('getEffectiveDefaultUser', () => {
    it('returns the pinned default when it resolves to a stored account', () => {
        const config: Config = {
            users: [
                { id: '1', email: 'a@b.c' },
                { id: '2', email: 'd@e.f' },
            ],
            user: { defaultUser: '2' },
        }
        expect(getEffectiveDefaultUser(config)?.id).toBe('2')
        expect(getEffectiveDefaultUserId(config)).toBe('2')
    })

    it('falls through an orphaned pin to the sole stored account', () => {
        const config: Config = {
            users: [{ id: '1', email: 'a@b.c' }],
            user: { defaultUser: '999' },
        }
        expect(getEffectiveDefaultUserId(config)).toBe('1')
    })

    it('treats a lone account as default with no pin', () => {
        expect(getEffectiveDefaultUserId({ users: [{ id: '1', email: 'a@b.c' }] })).toBe('1')
    })

    it('returns undefined for multiple accounts with no usable pin', () => {
        const users = [
            { id: '1', email: 'a@b.c' },
            { id: '2', email: 'd@e.f' },
        ]
        expect(getEffectiveDefaultUser({ users })).toBeUndefined()
        // Orphaned pin with multiple accounts → no implicit default either.
        expect(getEffectiveDefaultUserId({ users, user: { defaultUser: '999' } })).toBeUndefined()
    })

    it('returns undefined when no accounts are stored', () => {
        expect(getEffectiveDefaultUserId({})).toBeUndefined()
    })
})
