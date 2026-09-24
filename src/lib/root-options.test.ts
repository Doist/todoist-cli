import { findCommandToken } from '@doist/cli-core'
import { Command } from 'commander'
import { describe, expect, it } from 'vitest'
import { ROOT_VALUE_FLAGS } from './root-options.js'

/**
 * The token scan has to agree with commander for the root options `index.ts`
 * declares, or the lazy loader imports the wrong module. cli-core's own tests
 * cover its scan against its defaults; this suite pins it to td's options.
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
            const { token } = findCommandToken(argv, ROOT_VALUE_FLAGS)
            const ours = token !== undefined && KNOWN.has(token) ? token : undefined
            expect(ours).toBe(commanderDispatch(argv))
        },
    )

    it('does not mistake an option value for the command', () => {
        // An all-of-argv scan would find `task` here and import its module,
        // start the spinner, and only then let commander run `today`.
        const argv = ['--progress-jsonl', 'task', 'today']
        expect(findCommandToken(argv, ROOT_VALUE_FLAGS).token).toBe('today')
        expect(commanderDispatch(argv)).toBe('today')
    })
})
