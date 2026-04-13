import type { Marked, MarkedExtension } from 'marked'

let markedInstance: Marked | null = null
const renderCache = new Map<string, string>()

export async function preloadMarkdown(): Promise<void> {
    if (markedInstance) return
    const [{ Marked }, { createTerminalRenderer, darkTheme }] = await Promise.all([
        import('marked'),
        import('marked-terminal-renderer'),
    ])
    const instance = new Marked()
    // Types are not declared on the renderer module; cast to MarkedExtension
    instance.use(createTerminalRenderer(darkTheme()) as unknown as MarkedExtension)
    markedInstance = instance
}

function escape(text: string): string {
    // Handle uncompletable task prefix: escape leading "* " so it's not a bullet
    return text.startsWith('* ') ? `\\* ${text.slice(2)}` : text
}

/**
 * Pre-render markdown strings into the cache that `renderMarkdown` reads from.
 * Call this from async command handlers before invoking sync formatters that
 * need rendered output. Strings not pre-rendered will fall through as raw text.
 */
export async function prerenderMarkdown(
    texts: ReadonlyArray<string | undefined | null>,
): Promise<void> {
    if (!markedInstance) return
    for (const text of texts) {
        if (!text || renderCache.has(text)) continue
        const result = await markedInstance.parse(escape(text))
        renderCache.set(text, typeof result === 'string' ? result.trimEnd() : text)
    }
}

export function renderMarkdown(text: string): string {
    if (!markedInstance) return text
    return renderCache.get(text) ?? text
}
