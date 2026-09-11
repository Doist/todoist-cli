/**
 * Working out which argument names the command, without parsing the rest.
 *
 * The answer has to match what commander will go on to dispatch, because the
 * lazy loader in `index.ts` uses it to decide which module to import and
 * whether to start the early spinner. Scanning all of argv for the first
 * recognised name gets that wrong twice over: `td --progress-jsonl task today`
 * loads the task module while commander runs `today`, and once extensions
 * exist `td goals task list` would load the task module on its way to an
 * extension that never wanted it.
 *
 * Everything after the command token is the command's own business and is not
 * inspected here.
 */

/**
 * Root options that consume the next entry as their value, so the scan has to
 * step over it. Every other root option is boolean, and the `--flag=value`
 * form carries its own value, so neither can hide the command name.
 *
 * `--progress-jsonl` declares its value optional, but commander still takes a
 * following non-flag token for it, so this has to as well.
 *
 * Kept in step with the `program.option(...)` calls in `index.ts`; the tests
 * check the two agree by running commander itself.
 */
const VALUE_FLAGS: ReadonlySet<string> = new Set(['--user', '--progress-jsonl'])

export type CommandToken = {
    /** The first entry that is neither a root option nor an option's value. */
    token: string | undefined
    /** Its index in the scanned array, or the array's length when there is none. */
    index: number
}

export function findCommandToken(
    argv: string[],
    valueFlags: ReadonlySet<string> = VALUE_FLAGS,
): CommandToken {
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]

        // `--` ends option parsing but not subcommand dispatch: commander
        // reads the next entry as the command name even when it starts with a
        // dash, and reports it as an unknown command if it is not one.
        if (arg === '--') {
            return i + 1 < argv.length
                ? { token: argv[i + 1], index: i + 1 }
                : { token: undefined, index: argv.length }
        }

        // A bare `-` is the conventional stdin placeholder, not an option.
        if (arg.length > 1 && arg.startsWith('-')) {
            const takesValue =
                !arg.includes('=') &&
                valueFlags.has(arg) &&
                i + 1 < argv.length &&
                // A flag where the value should be means the value was
                // forgotten. Commander reports that itself; stepping over the
                // flag here would hide the command token behind it.
                !argv[i + 1].startsWith('-')
            if (takesValue) i++
            continue
        }

        return { token: arg, index: i }
    }

    return { token: undefined, index: argv.length }
}

/**
 * Whether this invocation needs to know which extensions are installed.
 *
 * Discovery is a directory read and a handful of small files, but it is not
 * free, and most invocations cannot use the answer: a built-in command always
 * wins over an extension of the same name, so nothing on disk changes what
 * happens next. What is left is `--help`, which lists extensions, completion,
 * which offers them, an extension being run, and a mistyped command, which
 * could be either.
 *
 * It lives here, beside the token scan and away from anything that imports the
 * extension system, so that asking the question costs nothing.
 */
export function needsExtensionLookup(
    argv: string[],
    builtIn: string | undefined,
    tokenIndex: number = argv.length,
): boolean {
    if (builtIn) return false
    // `--version` prints one line and lists nothing — but only when it is the
    // CLI's own flag. After the command token it belongs to whatever the token
    // names, and `td goals --version` has to reach `goals` like any other
    // argument would.
    return !argv.slice(0, tokenIndex).some((arg) => arg === '--version' || arg === '-V')
}
