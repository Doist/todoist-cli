import type { Marked, MarkedExtension } from 'marked'

let markedInstance: Marked | null = null

export async function preloadMarkdown(): Promise<void> {
    if (markedInstance) return
    const [{ Marked }, { markedTerminal }] = await Promise.all([
        import('marked'),
        import('marked-terminal'),
    ])
    const instance = new Marked()
    // Types are outdated - markedTerminal returns MarkedExtension at runtime
    instance.use(markedTerminal() as unknown as MarkedExtension)
    markedInstance = instance
}

export function renderMarkdown(text: string): string {
    if (!markedInstance) return text
    // Handle uncompletable task prefix: escape leading "* " so it's not a bullet
    const escaped = text.startsWith('* ') ? `\\* ${text.slice(2)}` : text
    const rendered = markedInstance.parse(escaped)
    return typeof rendered === 'string' ? rendered.trimEnd() : text
}
