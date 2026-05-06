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

    it('forwards shouldDisableSpinner to cli-core (TD_SPINNER=false suppresses the spinner)', () => {
        // shouldDisableSpinner is the wrapper's only CLI-specific hook.
        // Force an interactive, non-CI context so the *only* thing left
        // gating the spinner is shouldDisableSpinner reading TD_SPINNER.
        const stdout = process.stdout as unknown as { isTTY?: boolean }
        const originalIsTTY = stdout.isTTY
        stdout.isTTY = true
        const originalCI = process.env.CI
        delete process.env.CI
        process.env.TD_SPINNER = 'false'

        const writeBefore = process.stdout.write
        try {
            startEarlySpinner()
            // If the wiring is intact, cli-core saw isDisabled() === true
            // and never installed its stdout interceptor.
            expect(process.stdout.write).toBe(writeBefore)
        } finally {
            stdout.isTTY = originalIsTTY
            if (originalCI === undefined) delete process.env.CI
            else process.env.CI = originalCI
            delete process.env.TD_SPINNER
            stopEarlySpinner()
        }
    })
})
