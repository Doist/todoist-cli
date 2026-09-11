import { describe, expect, it } from 'vitest'
import { outputHints, sanitizeOutput } from './run.js'

// Built rather than written out, so the test file itself stays printable.
const ESC = String.fromCharCode(0x1b)
const BEL = String.fromCharCode(0x07)
const CARRIAGE_RETURN = String.fromCharCode(0x0d)
const C1_CSI = String.fromCharCode(0x9b)

function result(stderr: string, stdout = '') {
    return { code: 1, stdout, stderr, missing: false }
}

describe('sanitizeOutput', () => {
    it('removes escape sequences a terminal would act on rather than show', () => {
        // A remote controls this text, and the terminal would obey it: clear
        // the screen, then print something of its own choosing.
        expect(sanitizeOutput(`${ESC}[2Jfatal: nope`)).toBe('[2Jfatal: nope')
        expect(sanitizeOutput(`over${CARRIAGE_RETURN}write`)).toBe('overwrite')
        expect(sanitizeOutput(`ring${BEL}`)).toBe('ring')
    })

    it('removes the C1 range, which is a second way to write the same sequences', () => {
        expect(sanitizeOutput(`a${C1_CSI}2Kb`)).toBe('a2Kb')
    })

    it('keeps tabs and newlines, which carry the shape of the output', () => {
        expect(sanitizeOutput('one\ttwo\nthree')).toBe('one\ttwo\nthree')
    })

    it('leaves ordinary text alone', () => {
        expect(sanitizeOutput('fatal: repository not found')).toBe('fatal: repository not found')
    })
})

describe('outputHints', () => {
    it('takes the last lines of both streams', () => {
        expect(outputHints(result('one\ntwo\nthree\nfour\nfive'))).toEqual([
            'two',
            'three',
            'four',
            'five',
        ])
    })

    it('sanitises what it returns, since these are printed to a terminal', () => {
        expect(outputHints(result(`${ESC}[31mfatal: nope${ESC}[0m`))).toEqual([
            '[31mfatal: nope[0m',
        ])
    })

    it('drops blank lines and trims what is left', () => {
        expect(outputHints(result('  spaced  \n\n\n'))).toEqual(['spaced'])
    })

    it('honours the limit', () => {
        expect(outputHints(result('a\nb\nc'), 2)).toEqual(['b', 'c'])
    })
})
