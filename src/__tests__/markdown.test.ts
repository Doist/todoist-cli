import { describe, expect, it } from 'vitest'
import { preloadMarkdown, renderMarkdown } from '../lib/markdown.js'

describe('markdown', () => {
    describe('without preloadMarkdown', () => {
        // Note: these run before any preloadMarkdown call in this file. Once another
        // test in the suite calls preloadMarkdown, the module-level instance is set
        // and these assertions no longer hold — so they live before the preload block.
        it('returns input unchanged when renderer not loaded', async () => {
            const result = await renderMarkdown('**bold**')
            expect(result).toBe('**bold**')
        })
    })

    describe('with the real renderer loaded', () => {
        it('renders markdown via marked-terminal-renderer', async () => {
            await preloadMarkdown()
            const result = await renderMarkdown('# Heading\n\n**bold** and *italic*')
            // Pretty-printed output should differ from the raw input — proves the
            // marked-terminal-renderer extension is wired up and parsing.
            expect(result).not.toBe('# Heading\n\n**bold** and *italic*')
            expect(result).toContain('Heading')
            expect(result).toContain('bold')
            expect(result).toContain('italic')
            // Markdown syntax characters should be consumed by the renderer.
            expect(result).not.toContain('#')
            expect(result).not.toContain('**')
        })

        it('renders unordered lists with bullets', async () => {
            await preloadMarkdown()
            const result = await renderMarkdown('- one\n- two\n- three')
            expect(result).toContain('one')
            expect(result).toContain('two')
            expect(result).toContain('three')
            // marked-terminal-renderer's default dark-theme list character.
            expect(result).toContain('•')
        })

        it('escapes leading "* " so it is not parsed as a bullet', async () => {
            await preloadMarkdown()
            const result = await renderMarkdown('* task prefix should be escaped')
            // The escape preserves the literal asterisk + space at the start
            // instead of turning the line into a list item.
            expect(result.startsWith('* ')).toBe(true)
            expect(result).toContain('task prefix should be escaped')
        })

        it('is idempotent across multiple calls', async () => {
            await preloadMarkdown()
            const a = await renderMarkdown('**hello**')
            const b = await renderMarkdown('**hello**')
            expect(a).toBe(b)
        })
    })
})
