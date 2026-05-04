import { describe, expect, it } from 'vitest'
import { CliError } from './errors.js'
import { formatScopesHelp, parseScopesOption } from './oauth-scopes.js'

describe('parseScopesOption', () => {
    it('parses a single scope', () => {
        expect(parseScopesOption('app-management')).toEqual(['app-management'])
    })

    it('parses multiple comma-separated scopes', () => {
        expect(parseScopesOption('app-management,backups')).toEqual(['app-management', 'backups'])
    })

    it('trims whitespace around entries', () => {
        expect(parseScopesOption(' app-management ,  backups  ')).toEqual([
            'app-management',
            'backups',
        ])
    })

    it('returns scopes in canonical AUTH_FLAG_ORDER regardless of input order', () => {
        expect(parseScopesOption('backups,app-management')).toEqual(['app-management', 'backups'])
    })

    it('deduplicates repeated entries', () => {
        expect(parseScopesOption('backups,backups,app-management')).toEqual([
            'app-management',
            'backups',
        ])
    })

    it('throws CliError listing valid scopes when an entry is unknown', () => {
        try {
            parseScopesOption('nonsense')
            throw new Error('expected parseScopesOption to throw')
        } catch (error) {
            expect(error).toBeInstanceOf(CliError)
            const cliError = error as CliError
            expect(cliError.code).toBe('INVALID_OPTIONS')
            expect(cliError.message).toContain('Unknown scope')
            expect(cliError.message).toContain('nonsense')
            expect(cliError.hints?.[0]).toContain('app-management')
            expect(cliError.hints?.[0]).toContain('backups')
        }
    })

    it('throws CliError when given an empty string', () => {
        expect(() => parseScopesOption('')).toThrow(CliError)
        expect(() => parseScopesOption('   ')).toThrow(CliError)
    })

    it('rejects trailing or stray empty segments rather than silently filtering them', () => {
        // `app-management,` and `a,,b` are almost always typos — we surface them
        // as an error instead of quietly accepting them.
        for (const raw of ['app-management,', ',app-management', 'app-management,,backups', ',,']) {
            try {
                parseScopesOption(raw)
                throw new Error(`expected parseScopesOption(${JSON.stringify(raw)}) to throw`)
            } catch (error) {
                expect(error).toBeInstanceOf(CliError)
                expect((error as CliError).message).toContain('empty entry')
            }
        }
    })

    it('pluralizes the error message when multiple entries are unknown', () => {
        try {
            parseScopesOption('foo,bar')
            throw new Error('expected parseScopesOption to throw')
        } catch (error) {
            expect((error as CliError).message).toContain('Unknown scopes')
            expect((error as CliError).message).toContain('foo, bar')
        }
    })
})

describe('formatScopesHelp', () => {
    it('lists every registered scope with its summary', () => {
        const help = formatScopesHelp()
        expect(help).toContain('app-management')
        expect(help).toContain('backups')
        expect(help).toContain('rotate secrets')
        expect(help).toContain('List and download your Todoist backups.')
    })

    it('demonstrates the =<value> form in its examples', () => {
        const help = formatScopesHelp()
        expect(help).toContain('--additional-scopes=app-management')
        expect(help).toContain('--additional-scopes=backups')
        expect(help).toContain('--additional-scopes=app-management,backups')
    })
})
