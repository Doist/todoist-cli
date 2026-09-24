/**
 * The root options of `td` that consume the next argv entry as their value.
 *
 * `findCommandToken` from cli-core steps over these when working out which
 * entry names the command, and it cannot know them by itself: they are
 * declared by the `program.option(...)` calls in `index.ts`. Kept here rather
 * than inline so that the test beside this file can hold the set to what
 * commander actually does with those declarations.
 *
 * `--progress-jsonl` declares its value optional, but commander still takes a
 * following non-flag token for it, so it belongs here as well.
 */
export const ROOT_VALUE_FLAGS: ReadonlySet<string> = new Set(['--user', '--progress-jsonl'])
