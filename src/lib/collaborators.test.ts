/**
 * Unit tests for `formatUserShortName`.
 *
 * The emoji case is the regression: abbreviating by UTF-16 code unit took the
 * first half of 🌴 and returned `"Omar \ud83c."`, a lone surrogate that has no
 * UTF-8 form and is rejected by anything requiring well-formed text. The other
 * three names are the control and must be byte-identical to the old behaviour.
 */
import { describe, expect, it } from 'vitest'

import { formatUserShortName } from './collaborators.js'

describe('formatUserShortName', () => {
    it.each([
        ['Omar | 🌴', 'Omar 🌴.'],
        ['Ada Lovelace', 'Ada L.'],
        ['Rui', 'Rui'],
        ['Yuki 🎌 Tanaka', 'Yuki T.'],
    ])('abbreviates %j to %j', (input, expected) => {
        expect(formatUserShortName(input)).toBe(expected)
    })

    it('always returns well-formed output', () => {
        for (const name of ['Omar | 🌴', 'Ada Lovelace', 'Rui', 'Yuki 🎌 Tanaka', 'A 👨‍👩‍👧']) {
            expect(formatUserShortName(name).isWellFormed()).toBe(true)
        }
    })

    it('collapses surrounding and repeated whitespace as before', () => {
        expect(formatUserShortName('  Ada   Lovelace  ')).toBe('Ada L.')
    })
})
