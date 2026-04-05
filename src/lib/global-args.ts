/**
 * Centralized, type-safe parsing of global CLI flags.
 *
 * Replaces scattered `process.argv.includes()` checks with a single parse
 * that correctly handles grouped short flags (e.g., `-vq`), repeated flags
 * (e.g., `-vvv`), and avoids false-positives from option values.
 *
 * The result is lazily cached on first access — safe to call before or after
 * Commander's `parseAsync()` since it reads `process.argv` directly.
 */

export interface GlobalArgs {
    json: boolean
    ndjson: boolean
    quiet: boolean
    verbose: number // 0..4
    accessible: boolean
    noSpinner: boolean
    raw: boolean
    progressJsonl: string | true | false // false = absent, true = present without path, string = path
}

const SHORT_FLAGS: Record<string, keyof GlobalArgs> = {
    q: 'quiet',
    v: 'verbose',
}

/**
 * Parse well-known global flags from an argv array.
 *
 * Pure function — pass an explicit array for testing, or omit to use
 * `process.argv.slice(2)`.
 */
export function parseGlobalArgs(argv?: string[]): GlobalArgs {
    const args = argv ?? process.argv.slice(2)

    const result: GlobalArgs = {
        json: false,
        ndjson: false,
        quiet: false,
        verbose: 0,
        accessible: false,
        noSpinner: false,
        raw: false,
        progressJsonl: false,
    }

    for (let i = 0; i < args.length; i++) {
        const arg = args[i]

        // Standard CLI terminator — everything after is positional
        if (arg === '--') break

        // Long flags
        if (arg === '--json') {
            result.json = true
        } else if (arg === '--ndjson') {
            result.ndjson = true
        } else if (arg === '--quiet') {
            result.quiet = true
        } else if (arg === '--verbose') {
            result.verbose = Math.min(result.verbose + 1, 4)
        } else if (arg === '--accessible') {
            result.accessible = true
        } else if (arg === '--no-spinner') {
            result.noSpinner = true
        } else if (arg === '--raw') {
            result.raw = true
        } else if (arg === '--progress-jsonl' || arg.startsWith('--progress-jsonl=')) {
            if (arg.includes('=')) {
                // --progress-jsonl=path
                result.progressJsonl = arg.slice(arg.indexOf('=') + 1)
            } else if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
                // --progress-jsonl path (next arg is a value, not a flag)
                i++
                result.progressJsonl = args[i]
            } else {
                // --progress-jsonl (no value — output to stderr)
                result.progressJsonl = true
            }
        } else if (arg.length > 1 && arg[0] === '-' && arg[1] !== '-') {
            // Short flag group: -v, -vq, -vvv, etc.
            for (let j = 1; j < arg.length; j++) {
                const ch = arg[j]
                const mapped = SHORT_FLAGS[ch]
                if (mapped === 'verbose') {
                    result.verbose = Math.min(result.verbose + 1, 4)
                } else if (mapped === 'quiet') {
                    result.quiet = true
                }
                // Unknown short flags are silently ignored — they belong to
                // Commander or subcommands.
            }
        }
    }

    return result
}

// ---------------------------------------------------------------------------
// Cached singleton
// ---------------------------------------------------------------------------

let cached: GlobalArgs | null = null

function getGlobalArgs(): GlobalArgs {
    if (!cached) {
        cached = parseGlobalArgs()
    }
    return cached
}

/** Clear the cached parse result. Call in test teardown. */
export function resetGlobalArgs(): void {
    cached = null
}

// ---------------------------------------------------------------------------
// Query functions — drop-in replacements for the old process.argv checks
// ---------------------------------------------------------------------------

export function isJsonMode(): boolean {
    return getGlobalArgs().json
}

export function isNdjsonMode(): boolean {
    return getGlobalArgs().ndjson
}

export function isQuiet(): boolean {
    return getGlobalArgs().quiet
}

export function isAccessible(): boolean {
    return process.env.TD_ACCESSIBLE === '1' || getGlobalArgs().accessible
}

export function isRawMode(): boolean {
    return getGlobalArgs().raw
}

export function getVerboseLevel(): number {
    return getGlobalArgs().verbose
}

export function getProgressJsonlPath(): string | true | false {
    return getGlobalArgs().progressJsonl
}

export function shouldDisableSpinner(): boolean {
    if (process.env.TD_SPINNER === 'false') return true
    if (process.env.CI) return true

    const args = getGlobalArgs()
    return (
        args.json ||
        args.ndjson ||
        args.noSpinner ||
        args.progressJsonl !== false ||
        args.verbose > 0
    )
}
