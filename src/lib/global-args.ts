/**
 * Per-CLI extension of `@doist/cli-core`'s global-args parser.
 *
 * Layers todoist-cli's `--user <ref>` and `--raw` flags on top of the canonical
 * shape (`--json`, `--ndjson`, `--ids-only`, `--quiet`/`-q`, `--verbose`/`-v`,
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
    idsOnly: boolean
    raw: boolean
    /** --user <ref> — selects which stored Todoist account to use. */
    user: string | undefined
}

/** Back-compat alias — todoist-cli historically exported `GlobalArgs`. */
export type { TdGlobalArgs as GlobalArgs }

type LocalFlags = {
    user: string | undefined
    raw: boolean
    /** Set when `--progress-jsonl <path>` (space form) supplied a value. */
    progressJsonlPath: string | undefined
}

function parseTdLocalFlags(argv: string[]): LocalFlags {
    let user: string | undefined
    let raw = false
    let progressJsonlPath: string | undefined
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
        } else if (
            arg === '--progress-jsonl' &&
            i + 1 < argv.length &&
            !argv[i + 1].startsWith('-')
        ) {
            // Commander's `--progress-jsonl [path]` declaration accepts the
            // space-separated form, so the pre-commander parser has to too —
            // otherwise the path is silently dropped and the tracker writes
            // to stderr while commander stores the path. cli-core 0.5.0
            // intentionally drops this form (cross-CLI it can swallow
            // positionals); todoist-cli keeps it because the flag is global,
            // not subcommand-attached.
            i++
            progressJsonlPath = argv[i]
        }
    }
    return { user, raw, progressJsonlPath }
}

/**
 * Parse well-known global flags from an argv array. Pure — pass an explicit
 * array for testing, or omit to read `process.argv.slice(2)`.
 *
 * `--progress-jsonl` supports `--progress-jsonl` (bare → stderr),
 * `--progress-jsonl=<path>`, and `--progress-jsonl <path>` (space form),
 * mirroring commander's `[path]` declaration.
 */
/**
 * How many of `process.argv.slice(2)`'s entries belong to `td` itself.
 * `undefined`, the usual case, means all of them.
 *
 * It is set only when an extension is being dispatched, where the arguments
 * after the extension's name belong to the extension: `td goals --json --user
 * alice` is three arguments for `goals`, not td's output mode and account.
 * Setting it for a built-in would make `td task list --json` stop reporting
 * JSON mode, so the entry point sets it for nothing else.
 */
let hostArgvLength: number | undefined

export function parseGlobalArgs(argv?: string[]): TdGlobalArgs {
    // An explicit argv is a caller describing the whole world, so the boundary
    // applies only to the implicit read.
    const args = argv ?? process.argv.slice(2).slice(0, hostArgvLength)
    const base = parseCoreGlobalArgs(args)
    const { user, raw, progressJsonlPath } = parseTdLocalFlags(args)
    return {
        ...base,
        user,
        raw,
        progressJsonl: progressJsonlPath !== undefined ? progressJsonlPath : base.progressJsonl,
    }
}

const store = createGlobalArgsStore<TdGlobalArgs>(() => parseGlobalArgs())

/**
 * Set the boundary described above. The cached parse is dropped with it, so
 * the boundary applies however much of the CLI has already asked a question.
 */
export function setHostArgvLength(length: number | undefined): void {
    hostArgvLength = length
    store.reset()
}

/** Clear the cached parse result and the argv boundary. Call in test teardown. */
export function resetGlobalArgs(): void {
    hostArgvLength = undefined
    store.reset()
}

export function isJsonMode(): boolean {
    return store.get().json
}

export function isNdjsonMode(): boolean {
    return store.get().ndjson
}

export function isIdsOnlyMode(): boolean {
    return store.get().idsOnly
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
