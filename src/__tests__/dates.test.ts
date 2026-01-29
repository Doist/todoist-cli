import { describe, expect, it } from 'vitest'
import {
    formatDateHeader,
    getLocalDate,
    isDueBefore,
    isDueOnDate,
    parseDueDateToDay,
} from '../lib/dates.js'

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
