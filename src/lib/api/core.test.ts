import { describe, expect, it } from 'vitest'
import { buildRescheduleDate } from './core.js'

describe('buildRescheduleDate', () => {
    it('returns date as-is when input is date-only and task has no datetime', () => {
        const result = buildRescheduleDate('2026-03-20', {
            date: '2026-03-15',
            string: 'Mar 15',
            isRecurring: false,
        })
        expect(result).toBe('2026-03-20')
    })

    it('preserves existing time when input is date-only and task has datetime', () => {
        const result = buildRescheduleDate('2026-03-20', {
            date: '2026-03-15',
            string: 'every day at 2pm',
            isRecurring: true,
            datetime: '2026-03-15T14:00:00',
        })
        expect(result).toBe('2026-03-20T14:00:00')
    })

    it('preserves existing time with timezone suffix', () => {
        const result = buildRescheduleDate('2026-03-20', {
            date: '2026-03-15',
            string: 'every day at 2pm',
            isRecurring: true,
            datetime: '2026-03-15T14:00:00Z',
        })
        expect(result).toBe('2026-03-20T14:00:00Z')
    })

    it('uses provided datetime when input includes time', () => {
        const result = buildRescheduleDate('2026-03-20T10:00:00', {
            date: '2026-03-15',
            string: 'every day at 2pm',
            isRecurring: true,
            datetime: '2026-03-15T14:00:00',
        })
        expect(result).toBe('2026-03-20T10:00:00')
    })

    it('uses provided datetime even when task has no existing time', () => {
        const result = buildRescheduleDate('2026-03-20T10:00:00', {
            date: '2026-03-15',
            string: 'Mar 15',
            isRecurring: false,
        })
        expect(result).toBe('2026-03-20T10:00:00')
    })
})
