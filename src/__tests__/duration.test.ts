import { describe, expect, it } from 'vitest'
import { formatDuration, parseDuration } from '../lib/duration.js'

describe('parseDuration', () => {
    const validCases: [string, number][] = [
        ['1h', 60],
        ['2h', 120],
        ['3 h', 180],
        ['4h 15m', 255],
        ['4 h 15m', 255],
        ['4 h 15min', 255],
        ['10m', 10],
        ['10min', 10],
        ['10mins', 10],
        ['1 m', 1],
        ['5 h 1 m', 301],
        ['1 min', 1],
        ['1 mins', 1],
        ['2h15m', 135],
        ['2h15min', 135],
        ['2h15mins', 135],
        ['2 Hours 15 Minutes', 135],
        ['15m1h', 75],
    ]

    it.each(validCases)('parses "%s" as %d minutes', (input, expected) => {
        expect(parseDuration(input)).toBe(expected)
    })

    const invalidCases = [
        '',
        ' ',
        '1',
        'm',
        'min',
        'h',
        'h3',
        'hrs 3',
        'whatever 1m',
        '1-m',
        '1/m',
        '1s',
        '1d',
    ]

    it.each(invalidCases)('returns null for invalid input "%s"', (input) => {
        expect(parseDuration(input)).toBeNull()
    })
})

describe('formatDuration', () => {
    const minuteCases: [number, string][] = [
        [0, '0m'],
        [1, '1m'],
        [59, '59m'],
        [60, '1h'],
        [61, '1h1m'],
        [119, '1h59m'],
        [120, '2h'],
        [121, '2h1m'],
        [1439, '23h59m'],
        [1440, '1d'],
        [1441, '1d1m'],
        [1500, '1d1h'],
        [1501, '1d1h1m'],
    ]

    it.each(minuteCases)('formats %d minutes as "%s"', (minutes, expected) => {
        expect(formatDuration(minutes, 'minute')).toBe(expected)
    })

    it('formats day units correctly', () => {
        expect(formatDuration(1, 'day')).toBe('1d')
        expect(formatDuration(2, 'day')).toBe('2d')
    })

    it('is inverse of parseDuration for common values', () => {
        expect(parseDuration(formatDuration(15, 'minute'))).toBe(15)
        expect(parseDuration(formatDuration(60, 'minute'))).toBe(60)
        expect(parseDuration(formatDuration(105, 'minute'))).toBe(105)
    })
})
