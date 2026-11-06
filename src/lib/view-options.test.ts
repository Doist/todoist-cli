import { describe, expect, it } from 'vitest'
import { parseViewOptionFlags } from './view-options.js'

describe('parseViewOptionFlags', () => {
    it('returns undefined when no view flag was given', () => {
        expect(parseViewOptionFlags({})).toBeUndefined()
    })

    it('rejects --sort none, which a saved view cannot hold', () => {
        expect(() => parseViewOptionFlags({ sort: 'none' })).toThrow(
            expect.objectContaining({ code: 'INVALID_OPTIONS' }),
        )
    })

    it('rejects a grouping it has no word for', () => {
        expect(() => parseViewOptionFlags({ groupBy: 'colour' })).toThrow(
            expect.objectContaining({ code: 'INVALID_OPTIONS' }),
        )
    })

    it('rejects a direction for --sort default, which has none', () => {
        expect(() => parseViewOptionFlags({ sort: 'default', sortOrder: 'desc' })).toThrow(
            expect.objectContaining({ code: 'CONFLICTING_OPTIONS' }),
        )
    })

    it('spells the changes back as flags, with the direction it chose', () => {
        expect(
            parseViewOptionFlags({ viewStyle: 'Board', groupBy: 'none', sort: 'priority' })?.flags,
        ).toEqual([
            '--view-style',
            'board',
            '--group-by',
            'none',
            '--sort',
            'priority',
            '--sort-order',
            'desc',
        ])
    })
})
