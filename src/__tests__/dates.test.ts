import { describe, expect, it } from 'vitest'
import { formatDateHeader, getLocalDate } from '../lib/dates.js'

describe('getLocalDate', () => {
    it('returns today in YYYY-MM-DD format', () => {
        const result = getLocalDate(0)
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        const now = new Date()
        const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        expect(result).toBe(expected)
    })

    it('returns tomorrow with offset 1', () => {
        const today = getLocalDate(0)
        const tomorrow = getLocalDate(1)
        expect(tomorrow > today).toBe(true)
    })

    it('returns yesterday with offset -1', () => {
        const today = getLocalDate(0)
        const yesterday = getLocalDate(-1)
        expect(yesterday < today).toBe(true)
    })
})

describe('formatDateHeader', () => {
    const today = getLocalDate(0)
    const tomorrow = getLocalDate(1)
    const yesterday = getLocalDate(-1)

    it('returns "Overdue" for past dates', () => {
        expect(formatDateHeader(yesterday, today)).toBe('Overdue')
        expect(formatDateHeader('2020-01-01', today)).toBe('Overdue')
    })

    it('returns "Today" for today', () => {
        expect(formatDateHeader(today, today)).toBe('Today')
    })

    it('returns "Tomorrow" for tomorrow', () => {
        expect(formatDateHeader(tomorrow, today)).toBe('Tomorrow')
    })

    it('returns formatted date for future dates beyond tomorrow', () => {
        const futureDate = getLocalDate(5)
        const result = formatDateHeader(futureDate, today)
        expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/)
    })
})
