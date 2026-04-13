import { describe, expect, it } from 'vitest'
import { buildReloginCommand } from '../lib/auth-flags.js'
import type { AuthMetadata } from '../lib/auth.js'

function metadata(overrides: Partial<AuthMetadata> = {}): AuthMetadata {
    return {
        authMode: 'read-write',
        source: 'config-file',
        ...overrides,
    }
}

describe('buildReloginCommand', () => {
    it('returns a bare re-login command when authFlags is undefined', () => {
        expect(buildReloginCommand(metadata(), 'backups')).toBe('td auth login --backups')
    })

    it('returns a bare re-login command when authFlags is an empty array', () => {
        expect(buildReloginCommand(metadata({ authFlags: [] }), 'backups')).toBe(
            'td auth login --backups',
        )
    })

    it('preserves a prior --read-only flag', () => {
        expect(buildReloginCommand(metadata({ authFlags: ['read-only'] }), 'backups')).toBe(
            'td auth login --read-only --backups',
        )
    })

    it('does not duplicate the required flag if it is already present', () => {
        expect(buildReloginCommand(metadata({ authFlags: ['backups'] }), 'backups')).toBe(
            'td auth login --backups',
        )
    })

    it('emits flags in a canonical order regardless of the stored order', () => {
        expect(
            buildReloginCommand(
                metadata({ authFlags: ['app-management', 'read-only'] }),
                'backups',
            ),
        ).toBe('td auth login --read-only --app-management --backups')
    })
})
