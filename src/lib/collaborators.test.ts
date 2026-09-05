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

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/

describe('formatUserShortName', () => {
    it.each([
        ['Omar | 🌴', 'Omar 🌴.'],
        ['Ada Lovelace', 'Ada L.'],
        ['Rui', 'Rui'],
        ['Yuki 🎌 Tanaka', 'Yuki T.'],
    ])('abbreviates %j to %j', (input, expected) => {
        expect(formatUserShortName(input)).toBe(expected)
    })

    it('never returns a lone surrogate', () => {
        for (const name of ['Omar | 🌴', 'Ada Lovelace', 'Rui', 'Yuki 🎌 Tanaka', 'A 👨‍👩‍👧']) {
            expect(LONE_SURROGATE.test(formatUserShortName(name))).toBe(false)
        }
    })

    it('collapses surrounding and repeated whitespace as before', () => {
        expect(formatUserShortName('  Ada   Lovelace  ')).toBe('Ada L.')
    })
})
