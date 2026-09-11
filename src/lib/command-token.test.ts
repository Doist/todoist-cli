import { Command } from 'commander'
import { describe, expect, it } from 'vitest'
import { findCommandToken } from './command-token.js'

describe('findCommandToken', () => {
    it('returns nothing when there are no arguments', () => {
        expect(findCommandToken([])).toEqual({ token: undefined, index: 0 })
    })

    it('returns the first positional argument and its index', () => {
        expect(findCommandToken(['task', 'list'])).toEqual({ token: 'task', index: 0 })
        expect(findCommandToken(['--accessible', 'task'])).toEqual({ token: 'task', index: 1 })
    })

    it('does not inspect anything after the token', () => {
        // `task` here belongs to the extension, not to td.
        expect(findCommandToken(['goals', 'task', 'list'])).toEqual({ token: 'goals', index: 0 })
    })

    it('steps over the value of an option that takes one', () => {
        expect(findCommandToken(['--user', 'alice', 'task'])).toEqual({ token: 'task', index: 2 })
        expect(findCommandToken(['--progress-jsonl', '/tmp/out', 'task'])).toEqual({
            token: 'task',
            index: 2,
        })
    })

    it('steps over nothing for the inline form, which carries its own value', () => {
        expect(findCommandToken(['--user=alice', 'task'])).toEqual({ token: 'task', index: 1 })
    })

    it('leaves a forgotten value alone rather than hiding the token behind it', () => {
        // `--json` is not a value, it is the next flag. Commander reports the
        // missing value itself; swallowing it here would lose `today`.
        expect(findCommandToken(['--user', '--json', 'today'])).toEqual({
            token: 'today',
            index: 2,
        })
    })

    it('never treats a boolean option as taking a value', () => {
        expect(findCommandToken(['--accessible', 'task'])).toEqual({ token: 'task', index: 1 })
        expect(findCommandToken(['--no-spinner', 'task'])).toEqual({ token: 'task', index: 1 })
    })

    it.each([['-v'], ['-q'], ['-vvv'], ['-vq']])('skips the short option %s', (flag) => {
        expect(findCommandToken([flag, 'task'])).toEqual({ token: 'task', index: 1 })
    })

    it('reads the entry after `--` as the command, dash or not', () => {
        expect(findCommandToken(['--', 'task'])).toEqual({ token: 'task', index: 1 })
        expect(findCommandToken(['--', '--json'])).toEqual({ token: '--json', index: 1 })
    })

    it('returns nothing for a trailing `--`', () => {
        expect(findCommandToken(['--user', 'alice', '--'])).toEqual({
            token: undefined,
            index: 3,
        })
    })

    it('treats a bare dash as a token, since it is the stdin placeholder', () => {
        expect(findCommandToken(['-'])).toEqual({ token: '-', index: 0 })
    })

    it('treats an empty argument as a token', () => {
        expect(findCommandToken(['', 'task'])).toEqual({ token: '', index: 0 })
    })

    it('returns an unknown token rather than looking past it', () => {
        // Whether the token names anything is the caller's question.
        expect(findCommandToken(['nonsense', 'task'])).toEqual({ token: 'nonsense', index: 0 })
    })

    it('accepts a caller-supplied set of value-taking options', () => {
        expect(findCommandToken(['--ref', 'v1', 'task'], new Set(['--ref']))).toEqual({
            token: 'task',
            index: 2,
        })
        expect(findCommandToken(['--user', 'alice'], new Set())).toEqual({
            token: 'alice',
            index: 1,
        })
    })
})

/**
 * The scan only earns its keep if it agrees with commander. These cases run
 * both and compare, so that adding a root option to `index.ts` without adding
 * it to `VALUE_FLAGS` fails here rather than misrouting at runtime.
 */
describe('agreement with commander', () => {
    const KNOWN = new Set(['task', 'today', 'doctor'])

    /** The top-level command commander actually dispatches, if any. */
    function commanderDispatch(argv: string[]): string | undefined {
        let dispatched: string | undefined
        const program = new Command()
        program
            .name('td')
            .exitOverride()
            .configureOutput({ writeOut: () => {}, writeErr: () => {} })
            // Mirrors the root options declared in `index.ts`.
            .option('--no-spinner')
            .option('--progress-jsonl [path]')
            .option('-v, --verbose')
            .option('--accessible')
            .option('-q, --quiet')
            .option('--user <ref>')

        const task = program.command('task').action(() => {
            dispatched = 'task'
        })
        task.command('list')
            .option('--json')
            .action(() => {
                dispatched = 'task'
            })
        program.command('today').action(() => {
            dispatched = 'today'
        })
        program
            .command('doctor')
            .option('--offline')
            .action(() => {
                dispatched = 'doctor'
            })

        try {
            program.parse(argv, { from: 'user' })
        } catch {
            // Usage errors mean nothing was dispatched, which is the answer.
        }
        return dispatched
    }

    const cases: string[][] = [
        [],
        ['task'],
        ['task', 'list'],
        ['task', 'list', '--json'],
        ['today'],
        ['--accessible', 'task', 'list'],
        ['-v', 'today'],
        ['-vvv', 'today'],
        ['-vq', 'today'],
        ['-q', 'doctor', '--offline'],
        ['--user', 'alice', 'today'],
        ['--user=alice', 'today'],
        ['--user', '--quiet', 'today'],
        ['--progress-jsonl', '/tmp/out', 'today'],
        ['--progress-jsonl', 'today'],
        ['--progress-jsonl=/tmp/out', 'today'],
        ['--no-spinner', 'today'],
        ['--', 'today'],
        ['--', '--json'],
        ['nonsense'],
        ['-'],
        ['--accessible'],
    ]

    it.each(cases.map((argv) => [argv.join(' ') || '(no arguments)', argv]))(
        'resolves `td %s` the same way commander does',
        (_label, argv) => {
            const { token } = findCommandToken(argv)
            const ours = token !== undefined && KNOWN.has(token) ? token : undefined
            expect(ours).toBe(commanderDispatch(argv))
        },
    )

    it('no longer mistakes an option value for the command', () => {
        // The old all-of-argv scan found `task` here and imported its module,
        // started the spinner, and only then let commander run `today`.
        const argv = ['--progress-jsonl', 'task', 'today']
        expect(findCommandToken(argv).token).toBe('today')
        expect(commanderDispatch(argv)).toBe('today')
    })
})
