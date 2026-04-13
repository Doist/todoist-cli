import type { Marked } from 'marked'

let markedInstance: Marked | null = null

export async function preloadMarkdown(): Promise<void> {
    if (markedInstance) return
    const [{ Marked }, { createTerminalRenderer, darkTheme }] = await Promise.all([
        import('marked'),
        import('marked-terminal-renderer'),
    ])
    const instance = new Marked()
    instance.use(createTerminalRenderer(darkTheme()))
    markedInstance = instance
}

export async function renderMarkdown(text: string): Promise<string> {
    if (!markedInstance) return text
    // Handle uncompletable task prefix: escape leading "* " so it's not a bullet
    const escaped = text.startsWith('* ') ? `\\* ${text.slice(2)}` : text
    const rendered = await markedInstance.parse(escaped)
    return typeof rendered === 'string' ? rendered.trimEnd() : text
}
