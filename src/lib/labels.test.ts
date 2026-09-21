import { describe, expect, it } from 'vitest'
import { stripLabelAtPrefix } from './labels.js'

describe('stripLabelAtPrefix', () => {
    it('strips a single leading @', () => {
        expect(stripLabelAtPrefix('@work')).toBe('work')
    })

    it('leaves a name without a leading @ unchanged', () => {
        expect(stripLabelAtPrefix('work')).toBe('work')
    })

    it('only strips the first @, not a mid-string one', () => {
        expect(stripLabelAtPrefix('a@b')).toBe('a@b')
        expect(stripLabelAtPrefix('@a@b')).toBe('a@b')
    })

    it('returns an empty string for a bare @', () => {
        expect(stripLabelAtPrefix('@')).toBe('')
    })
})
