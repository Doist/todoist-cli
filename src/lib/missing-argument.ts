import type { Command } from 'commander'
import { CliError } from './errors.js'
import { isJsonMode, isNdjsonMode } from './global-args.js'

function commandPath(command: Command): string {
    const names: string[] = []
    for (let current: Command | null = command; current?.parent; current = current.parent) {
        names.unshift(current.name())
    }
    return ['td', ...names].join(' ')
}

/**
 * Stop a command that was run without the input it needs (a missing ref,
 * content, or option). Always a failure, so a script whose variable came back
 * empty does not see success: under `--json` / `--ndjson` it throws a
 * structured `MISSING_ARGUMENT` error, otherwise it prints the command's help
 * to stderr and exits 1.
 */
export function failWithUsage(command: Command): never {
    const path = commandPath(command)
    if (isJsonMode() || isNdjsonMode()) {
        throw new CliError('MISSING_ARGUMENT', `Missing required argument for \`${path}\`.`, [
            `Run \`${path} --help\` for usage`,
        ])
    }
    command.help({ error: true })
}
