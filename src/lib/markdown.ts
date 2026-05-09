import {
    preloadMarkdown as corePreloadMarkdown,
    renderMarkdown as coreRenderMarkdown,
} from '@doist/cli-core/markdown'

let preloaded = false

export async function preloadMarkdown(): Promise<void> {
    if (preloaded) return
    await corePreloadMarkdown()
    preloaded = true
}

export async function renderMarkdown(text: string): Promise<string> {
    if (!preloaded) return text
    // Handle uncompletable task prefix: escape leading "* " so it's not a bullet
    const escaped = text.startsWith('* ') ? `\\* ${text.slice(2)}` : text
    return coreRenderMarkdown(escaped)
}
