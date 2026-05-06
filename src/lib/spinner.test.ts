import { describe, expect, it } from 'vitest'

import {
    LoadingSpinner,
    resetEarlySpinner,
    startEarlySpinner,
    stopEarlySpinner,
    withSpinner,
} from './spinner.js'

// Smoke tests for the local wrapper. The detailed spinner behaviour
// (early-spinner adoption, colour palette, ✓/✗ rendering, etc.) is
// covered exhaustively in @doist/cli-core's own spinner suite — this
// file only verifies that we wire it up correctly and surface the
// expected public API.

describe('spinner wrapper', () => {
    it('re-exports the kit produced by createSpinner', () => {
        expect(typeof LoadingSpinner).toBe('function') // class constructor
        expect(typeof withSpinner).toBe('function')
        expect(typeof startEarlySpinner).toBe('function')
        expect(typeof stopEarlySpinner).toBe('function')
        expect(typeof resetEarlySpinner).toBe('function')
    })

    it('withSpinner returns the operation result', async () => {
        const result = await withSpinner({ text: 'noop', noSpinner: true }, async () => 42)
        expect(result).toBe(42)
    })

    it('withSpinner rethrows operation errors', async () => {
        await expect(
            withSpinner({ text: 'noop', noSpinner: true }, async () => {
                throw new Error('boom')
            }),
        ).rejects.toThrow('boom')
    })

    it('LoadingSpinner.start returns the spinner instance for chaining', () => {
        const s = new LoadingSpinner()
        expect(s.start({ text: 'noop', noSpinner: true })).toBe(s)
    })
})
