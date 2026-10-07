import type { Command } from 'commander'

/** A JSON-safe description of the Commander tree used by `--help --json`. */
export function commandSchema(command: Command): object {
    return {
        name: command.name(),
        aliases: command.aliases(),
        description: command.description(),
        arguments: command.registeredArguments.map((argument) => ({
            name: argument.name(),
            description: argument.description,
            required: argument.required,
            variadic: argument.variadic,
            choices: argument.argChoices,
        })),
        options: command.options.map((option) => ({
            flags: option.flags,
            description: option.description,
            required: option.required,
            optional: option.optional,
            choices: option.argChoices,
            defaultValue: option.defaultValue,
        })),
        commands: command.commands.map(commandSchema),
    }
}

/** Resolve a help path while stepping over recognized options and their values. */
export function resolveJsonHelpTarget(program: Command, argv: string[]): Command {
    let current = program
    for (let i = 0; i < argv.length; i++) {
        const token = argv[i]
        if (token === '--') break
        if (token.startsWith('-')) {
            const flag = token.split('=')[0]
            let owner: Command | null = current
            let option: Command['options'][number] | undefined
            while (owner && !option) {
                option = owner.options.find(
                    (candidate) => candidate.long === flag || candidate.short === flag,
                )
                owner = owner.parent
            }
            if (
                option &&
                (option.required || option.optional) &&
                !token.includes('=') &&
                argv[i + 1] &&
                !argv[i + 1].startsWith('-')
            ) {
                i++
            }
            continue
        }
        const child = current.commands.find(
            (command) => command.name() === token || command.aliases().includes(token),
        )
        if (!child) break
        current = child
    }
    return current
}
