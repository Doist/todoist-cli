import { describe, expect, it } from 'vitest'
import { fsCodeToCliError, toFileCliError } from './file-errors.js'

describe('fsCodeToCliError', () => {
    it('maps ENOENT to FILE_NOT_FOUND with the standard hint', () => {
        const err = fsCodeToCliError('ENOENT', 'Template file', '/tmp/missing.json')
        expect(err).toMatchObject({
            code: 'FILE_NOT_FOUND',
            message: 'Template file not found: /tmp/missing.json',
            hints: ['Check the file path and try again.'],
        })
    })

    it('maps EACCES / EPERM / EISDIR to FILE_READ_ERROR with detail', () => {
        for (const code of ['EACCES', 'EPERM', 'EISDIR'] as const) {
            const err = fsCodeToCliError(code, 'File', '/tmp/x', 'EACCES: permission denied')
            expect(err).toMatchObject({
                code: 'FILE_READ_ERROR',
                message: 'Cannot read file: /tmp/x',
                hints: ['EACCES: permission denied'],
            })
        }
    })

    it('lowercases the kind in the read-error message', () => {
        const err = fsCodeToCliError('EACCES', 'Template file', '/x')
        expect(err?.message).toBe('Cannot read template file: /x')
    })

    it('returns undefined for unknown codes so the caller can rethrow', () => {
        expect(fsCodeToCliError('EBADF', 'File', '/x')).toBeUndefined()
        expect(fsCodeToCliError(undefined, 'File', '/x')).toBeUndefined()
    })

    it('omits the path suffix when no path is given', () => {
        expect(fsCodeToCliError('ENOENT', 'File')?.message).toBe('File not found')
    })
})

describe('toFileCliError', () => {
    it('walks the error/cause chain looking for an fs error', () => {
        const fsError = Object.assign(new Error('ENOENT'), {
            code: 'ENOENT',
            path: '/tmp/nope',
        })
        const wrapper = Object.assign(new TypeError('fetch failed'), { cause: fsError })

        const mapped = toFileCliError(wrapper, 'File')
        expect(mapped).toMatchObject({
            code: 'FILE_NOT_FOUND',
            message: 'File not found: /tmp/nope',
        })
    })

    it('returns undefined for errors with no fs code in the chain', () => {
        expect(toFileCliError(new Error('something else'), 'File')).toBeUndefined()
        expect(toFileCliError('not an error', 'File')).toBeUndefined()
    })

    it('terminates on a cycle in the cause chain', () => {
        // Defensive: a malformed error graph shouldn't hang the CLI.
        const a: Error & { cause?: unknown } = new Error('a')
        const b: Error & { cause?: unknown } = new Error('b')
        a.cause = b
        b.cause = a
        expect(toFileCliError(a, 'File')).toBeUndefined()
    })
})
