import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
    formatDateHeader,
    getLocalDate,
    isDueBefore,
    isDueOnDate,
    parseDueDateToDay,
    parseLocalDate,
} from './dates.js'

describe('getLocalDate', () => {
    it('returns today in YYYY-MM-DD format', () => {
        const result = getLocalDate(0)
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        const now = new Date()
        const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        expect(result).toBe(expected)
    })

    it.each([
        { offset: 1, description: 'tomorrow', comparison: '>' },
        { offset: -1, description: 'yesterday', comparison: '<' },
        { offset: 7, description: 'next week', comparison: '>' },
        { offset: -7, description: 'last week', comparison: '<' },
    ])('returns $description with offset $offset', ({ offset, comparison }) => {
        const today = getLocalDate(0)
        const result = getLocalDate(offset)

        if (comparison === '>') {
            expect(result > today).toBe(true)
        } else {
            expect(result < today).toBe(true)
        }
    })
})

describe('formatDateHeader', () => {
    const today = getLocalDate(0)

    it.each([
        { dateOffset: -1, expected: 'Overdue', description: 'yesterday' },
        { dateOffset: -7, expected: 'Overdue', description: 'last week' },
        { date: '2020-01-01', expected: 'Overdue', description: 'old date' },
        { dateOffset: 0, expected: 'Today', description: 'today' },
        { dateOffset: 1, expected: 'Tomorrow', description: 'tomorrow' },
    ])('returns "$expected" for $description', ({ dateOffset, date, expected }) => {
        const testDate = date ?? getLocalDate(dateOffset ?? 0)
        expect(formatDateHeader(testDate, today)).toBe(expected)
    })

    it('returns formatted date for future dates beyond tomorrow', () => {
        const futureDate = getLocalDate(5)
        const result = formatDateHeader(futureDate, today)
        expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/)
    })
})

describe('parseDueDateToDay', () => {
    it.each([
        { input: '2026-01-29', description: 'date-only format' },
        { input: '2026-01-29T18:00:00', description: 'datetime format' },
        { input: '2026-01-29T00:00:00', description: 'midnight' },
        { input: '2026-01-29T23:59:59', description: 'end of day' },
    ])('parses $description correctly', ({ input }) => {
        const result = parseDueDateToDay(input)
        expect(result.toISOString()).toMatch(/2026-01-29T00:00:00/)
    })

    it('normalizes different times on same day to identical dates', () => {
        const times = ['09:00:00', '12:30:15', '18:00:00', '23:59:59']
        const results = times.map((time) => parseDueDateToDay(`2026-01-29T${time}`))

        // All should be identical
        results.forEach((result) => {
            expect(result.getTime()).toBe(results[0].getTime())
        })
    })
})

describe('isDueOnDate', () => {
    it.each([
        // Same date cases (should return true)
        {
            dueDate: '2026-01-29',
            targetDate: '2026-01-29',
            expected: true,
            description: 'exact date match',
        },
        {
            dueDate: '2026-01-29T18:00:00',
            targetDate: '2026-01-29',
            expected: true,
            description: 'datetime on same date (evening)',
        },
        {
            dueDate: '2026-01-29T09:00:00',
            targetDate: '2026-01-29',
            expected: true,
            description: 'datetime on same date (morning)',
        },
        {
            dueDate: '2026-01-29T00:00:00',
            targetDate: '2026-01-29',
            expected: true,
            description: 'datetime on same date (midnight)',
        },
        {
            dueDate: '2026-01-29T23:59:59',
            targetDate: '2026-01-29',
            expected: true,
            description: 'datetime on same date (end of day)',
        },
        {
            dueDate: '2026-01-31T23:00:00',
            targetDate: '2026-01-31',
            expected: true,
            description: 'month end edge case',
        },

        // Different date cases (should return false)
        {
            dueDate: '2026-01-28',
            targetDate: '2026-01-29',
            expected: false,
            description: 'day before',
        },
        {
            dueDate: '2026-01-30',
            targetDate: '2026-01-29',
            expected: false,
            description: 'day after',
        },
        {
            dueDate: '2026-01-28T23:59:59',
            targetDate: '2026-01-29',
            expected: false,
            description: 'late on day before',
        },
        {
            dueDate: '2026-02-01T01:00:00',
            targetDate: '2026-01-31',
            expected: false,
            description: 'month boundary edge case',
        },
        {
            dueDate: '2025-01-29',
            targetDate: '2026-01-29',
            expected: false,
            description: 'year boundary',
        },
    ])('returns $expected for $description', ({ dueDate, targetDate, expected }) => {
        expect(isDueOnDate(dueDate, targetDate)).toBe(expected)
    })
})

describe('isDueBefore', () => {
    it.each([
        // Before cases (should return true)
        {
            dueDate: '2026-01-28',
            targetDate: '2026-01-29',
            expected: true,
            description: 'day before (date only)',
        },
        {
            dueDate: '2026-01-28T18:00:00',
            targetDate: '2026-01-29',
            expected: true,
            description: 'day before (with time)',
        },
        {
            dueDate: '2026-01-28T23:59:59',
            targetDate: '2026-01-29',
            expected: true,
            description: 'late on day before',
        },
        {
            dueDate: '2025-12-31T23:59:59',
            targetDate: '2026-01-01',
            expected: true,
            description: 'year boundary edge case',
        },
        {
            dueDate: '2026-01-01',
            targetDate: '2026-01-15',
            expected: true,
            description: 'multiple days before',
        },

        // Same date cases (should return false regardless of time)
        {
            dueDate: '2026-01-29',
            targetDate: '2026-01-29',
            expected: false,
            description: 'same date (date only)',
        },
        {
            dueDate: '2026-01-29T00:00:00',
            targetDate: '2026-01-29',
            expected: false,
            description: 'same date (midnight)',
        },
        {
            dueDate: '2026-01-29T18:00:00',
            targetDate: '2026-01-29',
            expected: false,
            description: 'same date (evening)',
        },
        {
            dueDate: '2026-01-29T23:59:59',
            targetDate: '2026-01-29',
            expected: false,
            description: 'same date (end of day)',
        },
        {
            dueDate: '2026-01-01T00:00:00',
            targetDate: '2026-01-01',
            expected: false,
            description: 'same date (year boundary)',
        },

        // After cases (should return false)
        {
            dueDate: '2026-01-30',
            targetDate: '2026-01-29',
            expected: false,
            description: 'day after (date only)',
        },
        {
            dueDate: '2026-01-30T01:00:00',
            targetDate: '2026-01-29',
            expected: false,
            description: 'day after (with time)',
        },
        {
            dueDate: '2026-02-01',
            targetDate: '2026-01-31',
            expected: false,
            description: 'month boundary',
        },
        {
            dueDate: '2027-01-29',
            targetDate: '2026-01-29',
            expected: false,
            description: 'year after',
        },
    ])('returns $expected for $description', ({ dueDate, targetDate, expected }) => {
        expect(isDueBefore(dueDate, targetDate)).toBe(expected)
    })
})

describe('parseLocalDate', () => {
    it.each([
        ['2026-10-20', new Date(2026, 9, 20)],
        ['2026-10-20T09:30', new Date(2026, 9, 20, 9, 30)],
        ['2026-10-20 09:30', new Date(2026, 9, 20, 9, 30)],
        ['2026-10-20T09:30:15', new Date(2026, 9, 20, 9, 30, 15)],
        ['2026-10-20T09:30Z', new Date(Date.UTC(2026, 9, 20, 9, 30))],
        ['2026-10-20t09:30z', new Date(Date.UTC(2026, 9, 20, 9, 30))],
        ['2026-10-20T09:30+02:00', new Date(Date.UTC(2026, 9, 20, 7, 30))],
        ['2026-10-20T09:30-0530', new Date(Date.UTC(2026, 9, 20, 15, 0))],
        ['2026-10-20T09:30+14:00', new Date(Date.UTC(2026, 9, 19, 19, 30))],
        ['2026-10-20T09:30-12:00', new Date(Date.UTC(2026, 9, 20, 21, 30))],
        ['2026-10-20T09:30+00:00', new Date(Date.UTC(2026, 9, 20, 9, 30))],
        ['2026-10-20T09:00:00.000Z', new Date(Date.UTC(2026, 9, 20, 9, 0, 0, 0))],
        ['2026-10-20T09:00:00.5Z', new Date(Date.UTC(2026, 9, 20, 9, 0, 0, 500))],
        ['2026-10-20T09:00:00.123456Z', new Date(Date.UTC(2026, 9, 20, 9, 0, 0, 123))],
        ['2026-10-20T09:00:00.250+02:00', new Date(Date.UTC(2026, 9, 20, 7, 0, 0, 250))],
        ['2026-10-20T09:00:00.250', new Date(2026, 9, 20, 9, 0, 0, 250)],
        [' 2026-10-20 ', new Date(2026, 9, 20)],
    ])('parses %s', (input, expected) => {
        expect(parseLocalDate(input)?.getTime()).toBe(expected.getTime())
    })

    it.each([
        '',
        'next week',
        '2026',
        '2026-10',
        '20261020',
        '2026-02-30',
        '2026-02-31T10:00',
        '2026-02-30T10:00Z',
        '2026-04-31',
        '2026-13-01',
        '2026-00-10',
        '2026-10-00',
        '2026-10-32',
        '2026-10-20T24:00',
        '2026-10-20T09:60',
        '2026-10-20T09:30:60',
        '2026-10-20T09:60Z',
        '2026-10-20T09:30:60Z',
        '2026-10-20T09:30+02:60',
        '2026-10-20Z',
        '2026-10-20T09:30.5',
        '2026-10-20T09:00:00.',
        '2026-10-20T09:00:00.1234567890Z',
        '0099-01-01',
        '0001-01-01',
        '0000-01-01',
        '0099-01-01T00:00Z',
        '2026-10-20T09:30+14:01',
        '2026-10-20T09:30-12:01',
    ])('rejects %j', (input) => {
        expect(parseLocalDate(input)).toBeNull()
    })

    it('accepts 29 February only in a leap year', () => {
        expect(parseLocalDate('2028-02-29')).not.toBeNull()
        expect(parseLocalDate('2026-02-29')).toBeNull()
    })
})

describe('parseLocalDate round trip', () => {
    it('accepts what Date.toISOString() produces, millisecond for millisecond', () => {
        for (const ms of [0, 1, 999, 1_700_000_000_123, Date.now() + 86_400_000]) {
            const iso = new Date(ms).toISOString()
            expect(parseLocalDate(iso)?.getTime()).toBe(ms)
        }
    })
})

describe('parseLocalDate around daylight saving', () => {
    const originalTz = process.env.TZ

    beforeAll(() => {
        process.env.TZ = 'America/New_York'
    })

    afterAll(() => {
        if (originalTz === undefined) {
            delete process.env.TZ
        } else {
            process.env.TZ = originalTz
        }
    })

    it('rejects a local time that does not exist in the spring-forward gap', () => {
        expect(parseLocalDate('2026-03-08T02:30')).toBeNull()
        expect(parseLocalDate('2026-03-08T02:00:00')).toBeNull()
    })

    it('accepts the times on either side of the gap', () => {
        expect(parseLocalDate('2026-03-08T01:59')).not.toBeNull()
        expect(parseLocalDate('2026-03-08T03:00')).not.toBeNull()
    })

    it('accepts a time that happens twice when the clocks go back', () => {
        expect(parseLocalDate('2026-11-01T01:30')).not.toBeNull()
    })

    it('does not apply the gap rule to an explicit offset', () => {
        expect(parseLocalDate('2026-03-08T02:30Z')).not.toBeNull()
    })
})

describe('parseLocalDate never refuses a real calendar day, in any time zone', () => {
    const originalTz = process.env.TZ
    // Zones whose clocks skip at midnight (so midnight does not exist that day), plus half-hour gaps.
    const zones = [
        'UTC',
        'America/New_York',
        'America/Santiago',
        'America/Havana',
        'Asia/Beirut',
        'Africa/Cairo',
        'Australia/Lord_Howe',
        'Asia/Kolkata',
    ]

    afterAll(() => {
        if (originalTz === undefined) {
            delete process.env.TZ
        } else {
            process.env.TZ = originalTz
        }
    })

    it.each(zones)('accepts every day of 2026 as a date-only value in %s', (zone) => {
        process.env.TZ = zone
        const refused: string[] = []
        for (let day = 0; day < 365; day++) {
            const date = new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10)
            if (parseLocalDate(date) === null) {
                refused.push(date)
            }
        }
        expect(refused).toEqual([])
    })

    it('resolves a date-only value whose midnight is skipped to the first instant of that day', () => {
        process.env.TZ = 'America/Santiago'
        const result = parseLocalDate('2026-09-06')
        expect(result?.toISOString()).toBe('2026-09-06T04:00:00.000Z')
    })

    it('still rejects a typed time inside the gap on that day', () => {
        process.env.TZ = 'America/Santiago'
        expect(parseLocalDate('2026-09-06T00:30')).toBeNull()
        expect(parseLocalDate('2026-09-06T01:00')).not.toBeNull()
    })

    it('resolves a repeated autumn hour to its first occurrence', () => {
        process.env.TZ = 'America/New_York'
        expect(parseLocalDate('2026-11-01T01:30')?.toISOString()).toBe('2026-11-01T05:30:00.000Z')
    })
})
