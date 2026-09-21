// A leading `@` is display-only quickadd syntax and is never part of a stored
// label name. Strip it so `@Foo` and `Foo` resolve to the same label.
export function stripLabelAtPrefix(name: string): string {
    return name.startsWith('@') ? name.slice(1) : name
}
