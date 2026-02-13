import { type MarkedExtension, marked } from 'marked'
import { markedTerminal } from 'marked-terminal'

let initialized = false

export function renderMarkdown(text: string): string {
    if (!initialized) {
        // Types are outdated - markedTerminal returns MarkedExtension at runtime
        marked.use(markedTerminal() as unknown as MarkedExtension)
        initialized = true
    }
    // Handle uncompletable task prefix: escape leading "* " so it's not a bullet
    const escaped = text.startsWith('* ') ? `\\* ${text.slice(2)}` : text
    const rendered = marked.parse(escaped)
    if (typeof rendered !== 'string') {
        return text
    }
    return rendered.trimEnd()
}
