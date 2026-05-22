import { describe, expect, it } from 'vitest'
import { formatMoney } from './format.js'

// Locale is pinned so assertions are deterministic regardless of the host.
const LOCALE = 'en'

describe('formatMoney', () => {
    it('formats a 2-decimal currency (USD) from minor units', () => {
        expect(formatMoney(600, 'USD', LOCALE)).toBe('$6')
        expect(formatMoney(650, 'USD', LOCALE)).toBe('$6.50')
    })

    it('does not divide a 0-decimal currency (JPY) by 100', () => {
        // The bug this guards: with a hard-coded /100, ¥700 would render as ¥7.
        expect(formatMoney(700, 'JPY', LOCALE)).toBe('¥700')
    })

    it('uses 3 fraction digits for a 3-decimal currency (BHD)', () => {
        // 1500 minor units = 1.5 BHD (divisor 1000), not 15.
        const result = formatMoney(1500, 'BHD', LOCALE)
        expect(result).toContain('1.5')
        expect(result).not.toContain('15')
    })

    it('falls back to the raw minor-unit number for an invalid currency code', () => {
        // A malformed (non 3-letter) code makes Intl throw; we degrade safely.
        expect(formatMoney(500, 'US', LOCALE)).toBe('US 500')
    })
})
