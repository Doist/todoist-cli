import { describe, expect, it } from 'vitest'
import { htmlToMarkdown, resolveHelpCenterRef, sanitizeHelpCenterSnippet } from './help-center.js'

describe('help center helpers', () => {
    it('sanitizes snippets by stripping tags and decoding entities', () => {
        expect(
            sanitizeHelpCenterSnippet(
                'Manage <em>notifications</em> &amp; reminders&nbsp;across <strong>devices</strong>.',
            ),
        ).toBe('Manage notifications & reminders across devices.')
    })

    it('converts article HTML into readable markdown', () => {
        const markdown = htmlToMarkdown(`
            <h1>Notifications &amp; reminders</h1>
            <p>Turn on <strong>desktop</strong> alerts and visit <a href="https://example.com/settings">settings</a>.</p>
            <ul>
              <li>Review <em>web</em> notifications</li>
              <li>Use <code>td hc view id:360000269065</code></li>
            </ul>
            <pre><code>td hc search "notifications"</code></pre>
        `)

        expect(markdown).toContain('# Notifications & reminders')
        expect(markdown).toContain(
            'Turn on **desktop** alerts and visit [settings](https://example.com/settings).',
        )
        expect(markdown).toContain('- Review *web* notifications')
        expect(markdown).toContain('- Use `td hc view id:360000269065`')
        expect(markdown).toContain('```')
        expect(markdown).toContain('td hc search "notifications"')
    })

    it('resolves an explicit id: ref', () => {
        expect(resolveHelpCenterRef('id:360000269065')).toEqual({
            kind: 'article',
            articleId: '360000269065',
            locale: 'en-us',
            source: 'id',
        })
    })

    it('resolves a raw numeric article id', () => {
        expect(resolveHelpCenterRef('205348301')).toEqual({
            kind: 'article',
            articleId: '205348301',
            locale: 'en-us',
            source: 'id',
        })
    })

    it('resolves a Help Center URL', () => {
        expect(
            resolveHelpCenterRef(
                'https://get.todoist.help/hc/en-us/articles/360000269065-manage-your-notifications',
            ),
        ).toEqual({
            kind: 'article',
            articleId: '360000269065',
            htmlUrl:
                'https://get.todoist.help/hc/en-us/articles/360000269065-manage-your-notifications',
            locale: 'en-us',
            source: 'url',
        })
    })

    it('errors for non-id, non-url refs', () => {
        expect(() => resolveHelpCenterRef('notifications')).toThrow(
            'Invalid Help Center reference "notifications".',
        )
    })

    it('flags a www.todoist.com marketing URL for slug resolution', () => {
        expect(
            resolveHelpCenterRef(
                'https://www.todoist.com/help/articles/introduction-to-filters-V98wIH',
            ),
        ).toEqual({
            kind: 'marketing',
            marketingSlug: 'introduction-to-filters-V98wIH',
            urlLocale: 'en-us',
            locale: 'en-us',
            htmlUrl: 'https://www.todoist.com/help/articles/introduction-to-filters-V98wIH',
            source: 'url',
        })
    })

    it('extracts the URL locale from a localized marketing URL', () => {
        expect(
            resolveHelpCenterRef(
                'https://www.todoist.com/de/help/articles/einfuehrung-in-filter-V98wIH',
            ),
        ).toMatchObject({
            kind: 'marketing',
            urlLocale: 'de',
            locale: 'en-us',
        })
    })

    it('honours an explicit locale on a marketing URL while preserving the URL locale', () => {
        expect(
            resolveHelpCenterRef(
                'https://www.todoist.com/help/articles/introduction-to-filters-V98wIH',
                { locale: 'pt-br' },
            ),
        ).toMatchObject({
            kind: 'marketing',
            marketingSlug: 'introduction-to-filters-V98wIH',
            urlLocale: 'en-us',
            locale: 'pt-br',
        })
    })
})
