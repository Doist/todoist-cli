import { describe, expect, it, vi } from 'vitest'
import { LIMITS, paginate } from '../lib/pagination.js'

describe('paginate', () => {
    it('returns all results when less than limit', async () => {
        const fetchPage = vi.fn().mockResolvedValue({
            results: [1, 2, 3],
            nextCursor: null,
        })

        const result = await paginate(fetchPage, { limit: 10 })

        expect(result.results).toEqual([1, 2, 3])
        expect(result.nextCursor).toBeNull()
        expect(fetchPage).toHaveBeenCalledTimes(1)
    })

    it('respects limit option', async () => {
        const fetchPage = vi.fn().mockResolvedValue({
            results: [1, 2, 3, 4, 5],
            nextCursor: 'next',
        })

        const result = await paginate(fetchPage, { limit: 3 })

        expect(result.results).toEqual([1, 2, 3])
        expect(result.nextCursor).toBe('next')
    })

    it('continues fetching until limit reached', async () => {
        const fetchPage = vi
            .fn()
            .mockResolvedValueOnce({ results: [1, 2], nextCursor: 'page2' })
            .mockResolvedValueOnce({ results: [3, 4], nextCursor: 'page3' })
            .mockResolvedValueOnce({ results: [5], nextCursor: null })

        const result = await paginate(fetchPage, { limit: 10, perPage: 2 })

        expect(result.results).toEqual([1, 2, 3, 4, 5])
        expect(result.nextCursor).toBeNull()
        expect(fetchPage).toHaveBeenCalledTimes(3)
    })

    it('stops when no more pages (nextCursor is null)', async () => {
        const fetchPage = vi
            .fn()
            .mockResolvedValueOnce({ results: [1, 2], nextCursor: 'page2' })
            .mockResolvedValueOnce({ results: [3], nextCursor: null })

        const result = await paginate(fetchPage, { limit: 100 })

        expect(result.results).toEqual([1, 2, 3])
        expect(result.nextCursor).toBeNull()
        expect(fetchPage).toHaveBeenCalledTimes(2)
    })

    it('respects startCursor option', async () => {
        const fetchPage = vi.fn().mockResolvedValue({
            results: [10, 11],
            nextCursor: null,
        })

        await paginate(fetchPage, { limit: 10, startCursor: 'start-here' })

        expect(fetchPage).toHaveBeenCalledWith('start-here', expect.any(Number))
    })

    it('respects perPage option for page size', async () => {
        const fetchPage = vi.fn().mockResolvedValue({
            results: [1, 2, 3],
            nextCursor: null,
        })

        await paginate(fetchPage, { limit: 100, perPage: 50 })

        expect(fetchPage).toHaveBeenCalledWith(null, 50)
    })

    it('uses default perPage of 200', async () => {
        const fetchPage = vi.fn().mockResolvedValue({
            results: [1],
            nextCursor: null,
        })

        await paginate(fetchPage, { limit: 300 })

        expect(fetchPage).toHaveBeenCalledWith(null, 200)
    })

    it('returns nextCursor when more pages exist but limit reached', async () => {
        const fetchPage = vi.fn().mockResolvedValueOnce({ results: [1, 2, 3], nextCursor: 'more' })

        const result = await paginate(fetchPage, { limit: 3, perPage: 3 })

        expect(result.results).toEqual([1, 2, 3])
        expect(result.nextCursor).toBe('more')
    })

    it('handles empty first page', async () => {
        const fetchPage = vi.fn().mockResolvedValue({
            results: [],
            nextCursor: null,
        })

        const result = await paginate(fetchPage, { limit: 10 })

        expect(result.results).toEqual([])
        expect(result.nextCursor).toBeNull()
        expect(fetchPage).toHaveBeenCalledTimes(1)
    })

    it('passes correct cursor for subsequent pages', async () => {
        const fetchPage = vi
            .fn()
            .mockResolvedValueOnce({ results: [1], nextCursor: 'cursor-A' })
            .mockResolvedValueOnce({ results: [2], nextCursor: 'cursor-B' })
            .mockResolvedValueOnce({ results: [3], nextCursor: null })

        await paginate(fetchPage, { limit: 10, perPage: 1 })

        expect(fetchPage).toHaveBeenNthCalledWith(1, null, 1)
        expect(fetchPage).toHaveBeenNthCalledWith(2, 'cursor-A', 1)
        expect(fetchPage).toHaveBeenNthCalledWith(3, 'cursor-B', 1)
    })

    it('calculates correct remaining page size near limit', async () => {
        const fetchPage = vi
            .fn()
            .mockResolvedValueOnce({ results: [1, 2, 3], nextCursor: 'more' })
            .mockResolvedValueOnce({ results: [4, 5], nextCursor: null })

        await paginate(fetchPage, { limit: 5, perPage: 3 })

        expect(fetchPage).toHaveBeenNthCalledWith(1, null, 3)
        expect(fetchPage).toHaveBeenNthCalledWith(2, 'more', 2)
    })
})

describe('LIMITS', () => {
    it('has expected default values', () => {
        expect(LIMITS.tasks).toBe(300)
        expect(LIMITS.projects).toBe(50)
        expect(LIMITS.sections).toBe(300)
        expect(LIMITS.labels).toBe(300)
        expect(LIMITS.comments).toBe(10)
    })
})
