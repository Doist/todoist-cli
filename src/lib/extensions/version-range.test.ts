import { describe, expect, it } from 'vitest'
import { satisfiesRange } from './version-range.js'

describe('satisfiesRange', () => {
    it('treats a missing or wildcard range as satisfied', () => {
        expect(satisfiesRange('5.3.1', undefined)).toBe(true)
        expect(satisfiesRange('5.3.1', '')).toBe(true)
        expect(satisfiesRange('5.3.1', '*')).toBe(true)
    })

    it.each([
        ['5.3.1', '>=4.0.0', true],
        ['3.9.0', '>=4.0.0', false],
        ['4.0.0', '>=4.0.0', true],
        ['4.0.0', '>4.0.0', false],
        ['4.0.0', '<5.0.0', true],
        ['5.0.0', '<5.0.0', false],
        ['5.3.1', '5.3.1', true],
        ['5.3.2', '5.3.1', false],
    ])('%s against %s is %s', (version, range, expected) => {
        expect(satisfiesRange(version, range)).toBe(expected)
    })

    it('applies caret rules, narrowing as the version approaches zero', () => {
        expect(satisfiesRange('4.9.0', '^4.1.0')).toBe(true)
        expect(satisfiesRange('5.0.0', '^4.1.0')).toBe(false)
        expect(satisfiesRange('4.0.0', '^4.1.0')).toBe(false)
        expect(satisfiesRange('0.2.9', '^0.2.3')).toBe(true)
        expect(satisfiesRange('0.3.0', '^0.2.3')).toBe(false)
        // ^0.0.3 allows nothing above itself.
        expect(satisfiesRange('0.0.3', '^0.0.3')).toBe(true)
        expect(satisfiesRange('0.0.4', '^0.0.3')).toBe(false)
    })

    it('reads an operator written apart from its version', () => {
        expect(satisfiesRange('5.3.1', '>= 4.0.0')).toBe(true)
        expect(satisfiesRange('3.0.0', '>= 4.0.0')).toBe(false)
        expect(satisfiesRange('4.5.0', '>= 4.0.0 < 5.0.0')).toBe(true)
    })

    it('does not enforce half of a clause it cannot read in full', () => {
        // A hyphen range read as two exact matches would warn about a version
        // that actually sits inside it.
        expect(satisfiesRange('4.5.0', '4.0.0 - 5.0.0')).toBe(true)
    })

    it('ignores empty alternatives rather than letting them satisfy the range', () => {
        expect(satisfiesRange('3.0.0', '>=9.0.0 ||')).toBe(false)
        expect(satisfiesRange('3.0.0', '|| >=9.0.0')).toBe(false)
        expect(satisfiesRange('9.1.0', '>=9.0.0 ||')).toBe(true)
    })

    it('applies tilde rules', () => {
        expect(satisfiesRange('4.1.9', '~4.1.0')).toBe(true)
        expect(satisfiesRange('4.2.0', '~4.1.0')).toBe(false)
    })

    it('supports a conjunction and a disjunction', () => {
        expect(satisfiesRange('4.5.0', '>=4.0.0 <5.0.0')).toBe(true)
        expect(satisfiesRange('5.1.0', '>=4.0.0 <5.0.0')).toBe(false)
        expect(satisfiesRange('5.1.0', '^4.0.0 || >=5.0.0')).toBe(true)
    })

    it('passes ranges it cannot parse, since the check only drives a warning', () => {
        expect(satisfiesRange('5.3.1', 'next')).toBe(true)
        expect(satisfiesRange('5.3.1', '>=4.0.0-alpha.x.y.z.what')).toBe(true)
    })
})
