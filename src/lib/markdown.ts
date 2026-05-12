import {
    preloadMarkdown as corePreloadMarkdown,
    renderMarkdown as coreRenderMarkdown,
} from '@doist/cli-core/markdown'

let preloadPromise: Promise<void> | null = null

export async function preloadMarkdown(): Promise<void> {
    if (!preloadPromise) preloadPromise = corePreloadMarkdown()
    return preloadPromise
}

export async function renderMarkdown(text: string): Promise<string> {
    if (!preloadPromise) return text
    await preloadPromise
    // Handle uncompletable task prefix: escape leading "* " so it's not a bullet
    const escaped = text.startsWith('* ') ? `\\* ${text.slice(2)}` : text
    return coreRenderMarkdown(escaped)
}
