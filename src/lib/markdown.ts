import { type MarkedExtension, marked } from 'marked'
import { markedTerminal } from 'marked-terminal'

// Types are outdated - markedTerminal returns MarkedExtension at runtime
marked.use(markedTerminal() as unknown as MarkedExtension)

export function renderMarkdown(text: string): string {
    // Handle uncompletable task prefix: escape leading "* " so it's not a bullet
    const escaped = text.startsWith('* ') ? `\\* ${text.slice(2)}` : text
    const rendered = marked.parse(escaped)
    if (typeof rendered !== 'string') {
        return text
    }
    return rendered.trimEnd()
}
