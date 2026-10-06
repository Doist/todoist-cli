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
