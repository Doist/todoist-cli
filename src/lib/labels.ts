// A leading `@` is display-only quickadd syntax and is never part of a stored
// label name. Strip it so `@Foo` and `Foo` resolve to the same label. The input
// is trimmed first, so callers can pass a raw value; a `@ Foo` with a space
// after the `@` normalises to `Foo` too.
export function stripLabelAtPrefix(name: string): string {
    const trimmed = name.trim()
    return trimmed.startsWith('@') ? trimmed.slice(1).trim() : trimmed
}
