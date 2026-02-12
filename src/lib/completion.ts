import type { Command, Option } from 'commander'

export interface CompletionItem {
    name: string
    description?: string
}

/**
 * Known enum values for specific option flags.
 * Keyed by long option name (e.g. '--priority').
 */
const KNOWN_VALUES: Record<string, string[]> = {
    '--priority': ['p1', 'p2', 'p3', 'p4'],
    '--view-style': ['list', 'board'],
    '--event': [
        'added',
        'updated',
        'deleted',
        'completed',
        'uncompleted',
        'archived',
        'unarchived',
        'shared',
        'left',
    ],
    '--type': ['task', 'comment', 'project'],
    '--theme': [
        'todoist',
        'dark',
        'moonstone',
        'tangerine',
        'kale',
        'blueberry',
        'lavender',
        'raspberry',
    ],
    '--time-format': ['12', '24'],
    '--date-format': ['us', 'intl'],
    '--start-day': ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    '--next-week': ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    '--role': ['ADMIN', 'MEMBER', 'GUEST'],
    '--vacation': ['on', 'off'],
}

/** Names to exclude from completion results (internal commands) */
const HIDDEN_COMMAND_NAMES = new Set(['completion-server'])

/**
 * Check if a Commander Option expects a value argument (not a boolean flag).
 */
function optionExpectsValue(opt: Option): boolean {
    // required means <value>, optional means [value] — both expect a value
    return opt.required || opt.optional
}

/**
 * Find an option by its long or short flag in a command.
 */
function findOption(cmd: Command, flag: string): Option | undefined {
    return cmd.options.find((o: Option) => o.long === flag || o.short === flag)
}

/**
 * Get completions for the current command line context.
 *
 * @param program - The root Commander program with all commands registered
 * @param words - The words on the command line (excluding the binary name)
 * @param current - The current word being typed (may be empty string)
 * @returns Array of completion items
 */
export function getCompletions(
    program: Command,
    words: string[],
    current: string,
): CompletionItem[] {
    let activeCmd = program
    let seenDoubleDash = false
    const usedOptions = new Set<string>()

    // Walk the words to find the active command context
    let i = 0
    while (i < words.length) {
        const word = words[i]

        // If we hit the current word (last position), stop walking
        if (i === words.length - 1 && word === current) {
            break
        }

        if (word === '--') {
            seenDoubleDash = true
            i++
            continue
        }

        if (!seenDoubleDash && word.startsWith('-')) {
            // Handle --flag=value syntax
            const eqIdx = word.indexOf('=')
            const flag = eqIdx > 0 ? word.slice(0, eqIdx) : word

            usedOptions.add(flag)

            // If this option expects a value and no = was used, consume the next word
            if (eqIdx < 0) {
                const opt = findOption(activeCmd, flag)
                if (opt && optionExpectsValue(opt)) {
                    i++ // skip the value word
                }
            }

            i++
            continue
        }

        // Try to descend into a subcommand
        const sub = activeCmd.commands.find(
            (c: Command) => c.name() === word || c.aliases().includes(word),
        )
        if (sub) {
            activeCmd = sub
            usedOptions.clear()
        }
        // Otherwise it's a positional argument — don't descend, just skip

        i++
    }

    // Now determine what to complete based on context

    // Check if the previous word was an option that expects a value
    if (words.length >= 2) {
        const prevWord = words[words.length - 2]
        if (prevWord && !prevWord.startsWith('-')) {
            // prev is not an option, skip
        } else if (prevWord && prevWord !== '--') {
            const eqIdx = prevWord.indexOf('=')
            const flag = eqIdx > 0 ? prevWord.slice(0, eqIdx) : prevWord
            const opt = findOption(activeCmd, flag)
            if (opt && optionExpectsValue(opt) && eqIdx < 0) {
                // Previous word is an option expecting a value — suggest enum values
                const enumValues = KNOWN_VALUES[opt.long ?? '']
                if (enumValues) {
                    return enumValues.filter((v) => v.startsWith(current)).map((v) => ({ name: v }))
                }
                // No known enum values — return empty (let shell do default completion)
                return []
            }
        }
    }

    // Handle --flag=<TAB> — suggest values after =
    if (current.includes('=')) {
        const eqIdx = current.indexOf('=')
        const flag = current.slice(0, eqIdx)
        const partial = current.slice(eqIdx + 1)
        const opt = findOption(activeCmd, flag)
        if (opt) {
            const enumValues = KNOWN_VALUES[opt.long ?? '']
            if (enumValues) {
                return enumValues
                    .filter((v) => v.startsWith(partial))
                    .map((v) => ({ name: `${flag}=${v}` }))
            }
        }
        return []
    }

    // If after --, only suggest subcommands (no options)
    if (seenDoubleDash) {
        return getSubcommandCompletions(activeCmd, current)
    }

    // If current word starts with -, suggest options
    if (current.startsWith('-')) {
        return getOptionCompletions(activeCmd, current, usedOptions)
    }

    // Suggest subcommands, and if there are none, suggest options instead
    const subcommands = getSubcommandCompletions(activeCmd, current)
    if (subcommands.length > 0) {
        return subcommands
    }
    return getOptionCompletions(activeCmd, current, usedOptions)
}

function getSubcommandCompletions(cmd: Command, prefix: string): CompletionItem[] {
    return cmd.commands
        .filter(
            (c: Command) =>
                !(c as Command & { _hidden?: boolean })._hidden &&
                !HIDDEN_COMMAND_NAMES.has(c.name()),
        )
        .filter((c: Command) => c.name().startsWith(prefix))
        .map((c: Command) => ({
            name: c.name(),
            description: c.description(),
        }))
}

function getOptionCompletions(
    cmd: Command,
    prefix: string,
    usedOptions: Set<string>,
): CompletionItem[] {
    return cmd.options
        .filter((o: Option) => {
            if (!o.long) return false
            if (o.hidden) return false
            // Exclude already-used options
            if (usedOptions.has(o.long)) return false
            if (o.short && usedOptions.has(o.short)) return false
            return o.long.startsWith(prefix)
        })
        .map((o: Option) => ({
            name: o.long as string,
            description: o.description,
        }))
}
