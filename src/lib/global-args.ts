/**
 * Per-CLI extension of `@doist/cli-core`'s global-args parser.
 *
 * Layers todoist-cli's `--user <ref>` and `--raw` flags on top of the
 * canonical shape (`--json`, `--ndjson`, `--quiet`/`-q`, `--verbose`/`-v`,
 * `--accessible`, `--no-spinner`, `--progress-jsonl`).
 */

import {
    createAccessibleGate,
    createGlobalArgsStore,
    createSpinnerGate,
    type GlobalArgs,
    parseGlobalArgs as parseCoreGlobalArgs,
} from '@doist/cli-core'

export type TdGlobalArgs = GlobalArgs & {
    raw: boolean
    /** --user <ref> — selects which stored Todoist account to use. */
    user: string | undefined
}

/** Back-compat alias — todoist-cli historically exported `GlobalArgs`. */
export type { TdGlobalArgs as GlobalArgs }

function parseTdLocalFlags(argv: string[]): { user: string | undefined; raw: boolean } {
    let user: string | undefined
    let raw = false
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (arg === '--') break
        if (arg === '--raw') {
            raw = true
        } else if (arg === '--user') {
            // Only consume the next arg as the value when it doesn't look
            // like another flag — `td --user --json ...` should leave `user`
            // undefined so commander surfaces a usage error rather than
            // silently swallowing `--json` as the user ref.
            if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
                i++
                user = argv[i]
            }
        } else if (arg.startsWith('--user=')) {
            user = arg.slice('--user='.length)
        }
    }
    return { user, raw }
}

/**
 * Parse well-known global flags from an argv array. Pure — pass an explicit
 * array for testing, or omit to read `process.argv.slice(2)`.
 *
 * `--progress-jsonl` accepts only the bare form (output to stderr) and
 * `--progress-jsonl=path`. The space-separated form is intentionally
 * unsupported (would silently consume the next positional arg).
 */
export function parseGlobalArgs(argv?: string[]): TdGlobalArgs {
    const args = argv ?? process.argv.slice(2)
    return { ...parseCoreGlobalArgs(args), ...parseTdLocalFlags(args) }
}

const store = createGlobalArgsStore<TdGlobalArgs>(() => parseGlobalArgs())

/** Clear the cached parse result. Call in test teardown. */
export const resetGlobalArgs = store.reset

export function isJsonMode(): boolean {
    return store.get().json
}

export function isNdjsonMode(): boolean {
    return store.get().ndjson
}

export function isQuiet(): boolean {
    return store.get().quiet
}

export function isRawMode(): boolean {
    return store.get().raw
}

export function getVerboseLevel(): TdGlobalArgs['verbose'] {
    return store.get().verbose
}

export function getProgressJsonlPath(): string | true | false {
    return store.get().progressJsonl
}

export function getRequestedUserRef(): string | undefined {
    return store.get().user
}

export const isAccessible = createAccessibleGate({
    envVar: 'TD_ACCESSIBLE',
    getArgs: store.get,
})

export const shouldDisableSpinner = createSpinnerGate({
    envVar: 'TD_SPINNER',
    getArgs: store.get,
})

/**
 * Remove `--user <ref>` / `--user=<ref>` from an argv array so commander —
 * which has no global-option attachment — never sees the flag at subcommand
 * level. Returns a new array; the original is not mutated. Stops at the `--`
 * terminator so positional args after it are preserved verbatim.
 */
export function stripUserFlag(argv: string[]): string[] {
    const out: string[] = []
    let stopped = false
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (stopped) {
            out.push(arg)
            continue
        }
        if (arg === '--') {
            stopped = true
            out.push(arg)
            continue
        }
        if (arg === '--user') {
            // Stays in lockstep with `parseTdLocalFlags` above.
            if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) i++
            continue
        }
        if (arg.startsWith('--user=')) {
            continue
        }
        out.push(arg)
    }
    return out
}
