/**
 * Unit tests for the code-point-safe string helpers.
 *
 * Every case carries its control: an input that MUST change and an input that
 * MUST NOT, so a helper that quietly did nothing (or mangled ordinary text)
 * cannot pass.
 */
import { describe, expect, it } from 'vitest'

import { firstCodePoint, truncateForDisplay } from './text.js'

describe('firstCodePoint', () => {
    it('keeps an astral character whole', () => {
        expect(firstCodePoint('🌴')).toBe('🌴')
        expect(firstCodePoint('🌴 tail')).toBe('🌴')
    })

    it('returns the same character as [0] for ordinary text', () => {
        // The control: for BMP text the two agree, so the fix only moves the broken case.
        for (const s of ['Lovelace', 'ada', 'Álvarez', 'здраво', '123']) {
            expect(firstCodePoint(s)).toBe(s[0])
        }
    })

    it('returns an empty string for empty input rather than undefined', () => {
        expect(firstCodePoint('')).toBe('')
    })
})

describe('truncateForDisplay', () => {
    it('leaves a string that already fits completely untouched', () => {
        expect(truncateForDisplay('short', 80)).toBe('short')
        expect(truncateForDisplay('🌴🌴🌴', 80)).toBe('🌴🌴🌴')
        const exact = 'x'.repeat(80)
        expect(truncateForDisplay(exact, 80)).toBe(exact)
    })

    it('truncates with an ellipsis past the limit', () => {
        expect(truncateForDisplay('x'.repeat(81), 80)).toBe(`${'x'.repeat(80)}...`)
    })

    it('never cuts an astral character in half', () => {
        // MUST FIRE: the emoji straddles the 80th code unit, which is exactly
        // where `slice(0, 80)` used to bisect it.
        const straddling = `${'x'.repeat(79)}🌴 tail`
        const out = truncateForDisplay(straddling, 80)
        expect(out.isWellFormed()).toBe(true)
        expect(out).toBe(`${'x'.repeat(79)}🌴...`)

        // MUST STAY SILENT: 76 code points fit under the limit, so this must
        // come back byte-identical. Asserting only "no lone surrogate" would
        // pass even if the input had been mangled into a different valid string.
        const clear = `${'x'.repeat(70)}🌴 tail`
        expect(truncateForDisplay(clear, 80)).toBe(clear)
    })

    it('counts in the same unit it cuts, so the check cannot disagree with the slice', () => {
        // 40 emoji are 40 code points but 80 code units. Counting units would
        // call this "not too long" at 80 and then a 50-unit cut would bisect it.
        const emoji = '🌴'.repeat(40)
        expect(truncateForDisplay(emoji, 40)).toBe(emoji)
        expect(truncateForDisplay(emoji, 10)).toBe(`${'🌴'.repeat(10)}...`)
        expect(truncateForDisplay(emoji, 10).isWellFormed()).toBe(true)
    })
})
