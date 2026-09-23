import { describe, expect, it } from 'vitest'
import { mapWithConcurrency } from './concurrency.js'

describe('mapWithConcurrency', () => {
    it('never runs more than the limit at once', async () => {
        let active = 0
        let peak = 0

        await mapWithConcurrency(
            Array.from({ length: 12 }, (_, index) => index),
            4,
            async (item) => {
                active += 1
                peak = Math.max(peak, active)
                await new Promise((resolve) => setTimeout(resolve, 5))
                active -= 1
                return item
            },
        )

        expect(peak).toBeLessThanOrEqual(4)
    })

    it('keeps results in the order of the input', async () => {
        const results = await mapWithConcurrency([3, 1, 2], 2, async (item) => {
            await new Promise((resolve) => setTimeout(resolve, item))
            return item * 10
        })

        expect(results).toEqual([30, 10, 20])
    })

    it('runs everything even when there are fewer items than the limit', async () => {
        const results = await mapWithConcurrency([1, 2], 8, async (item) => item * 2)

        expect(results).toEqual([2, 4])
    })

    it('does nothing, successfully, for an empty list', async () => {
        await expect(mapWithConcurrency([], 4, async () => 'never')).resolves.toEqual([])
    })
})
