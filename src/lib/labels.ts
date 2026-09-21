// A leading `@` is display-only quickadd syntax and is never part of a stored
// label name. Strip it so `@Foo` and `Foo` resolve to the same label. Keep this
// the single source of truth for the rule so it can't drift between commands.
export function stripLabelAtPrefix(name: string): string {
    return name.startsWith('@') ? name.slice(1) : name
}
