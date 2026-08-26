import { describe, expect, it } from 'vitest'
import { resolveOutputMode } from './output-mode.js'

describe('resolveOutputMode', () => {
    it('defaults to human output', () => {
        expect(resolveOutputMode({})).toBe('human')
    })

    it.each([
        [{ json: true }, 'json'],
        [{ ndjson: true }, 'ndjson'],
        [{ idsOnly: true }, 'ids-only'],
        [{ markdown: true }, 'markdown'],
    ] as const)('resolves %o to %s', (options, expected) => {
        expect(resolveOutputMode(options)).toBe(expected)
    })

    it('rejects conflicting output flags', () => {
        expect(() => resolveOutputMode({ json: true, idsOnly: true })).toThrow(
            'Options --json, --ids-only are mutually exclusive.',
        )
    })
})
