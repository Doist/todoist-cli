import { captureStream } from '@doist/cli-core/testing'
import { Command } from 'commander'
import { afterEach, describe, expect, it } from 'vitest'
import { CliError } from './errors.js'
import { resetGlobalArgs } from './global-args.js'
import { failWithUsage } from './missing-argument.js'

function buildProgram(): { program: Command } {
    const program = new Command('td').exitOverride()
    const task = program.command('task').exitOverride()
    const complete = task
        .command('complete [ref]')
        .option('--json')
        .option('--ndjson')
        .exitOverride()
        .action((ref) => {
            if (!ref) failWithUsage(complete)
        })
    return { program }
}

describe('failWithUsage', () => {
    const realArgv = process.argv

    afterEach(() => {
        process.argv = realArgv
        resetGlobalArgs()
    })

    it('prints help to stderr and exits 1', async () => {
        process.argv = ['node', 'td', 'task', 'complete']
        resetGlobalArgs()
        const stdoutSpy = captureStream()
        const stderrSpy = captureStream('stderr')
        const { program } = buildProgram()

        await expect(program.parseAsync(process.argv)).rejects.toMatchObject({
            code: 'commander.help',
            exitCode: 1,
        })
        expect(stderrSpy.mock.calls.map((c) => c[0]).join('')).toContain('Usage: td task complete')
        expect(stdoutSpy).not.toHaveBeenCalled()
    })

    it.each(['--json', '--ndjson'])('throws MISSING_ARGUMENT under %s', async (flag) => {
        process.argv = ['node', 'td', 'task', 'complete', flag]
        resetGlobalArgs()
        const { program } = buildProgram()

        const error = await program.parseAsync(process.argv).catch((e: unknown) => e)
        // A CliError reaches `reportFatal` in src/index.ts, which prints it as
        // JSON and exits 1, the same exit code as the human-readable path.
        expect(error).toBeInstanceOf(CliError)
        expect(error).toMatchObject({
            code: 'MISSING_ARGUMENT',
            message: 'Missing required argument for `td task complete`.',
        })
    })
})
