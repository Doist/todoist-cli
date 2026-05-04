import { openInBrowser } from '../../lib/browser.js'
import { readConfig } from '../../lib/config.js'
import { CliError } from '../../lib/errors.js'
import {
    formatHelpCenterArticleMarkdown,
    getHelpCenterArticle,
    resolveHelpCenterRef,
    resolveMarketingArticleId,
} from '../../lib/help-center.js'
import { renderMarkdown } from '../../lib/markdown.js'
import { withSpinner } from '../../lib/spinner.js'

export interface ViewHelpCenterOptions {
    browser?: boolean
    html?: boolean
    json?: boolean
    locale?: string
}

export async function viewHelpCenterArticle(
    ref: string,
    options: ViewHelpCenterOptions = {},
): Promise<void> {
    const selectedModes = [options.browser, options.html, options.json].filter(Boolean)
    if (selectedModes.length > 1) {
        throw new CliError(
            'CONFLICTING_OPTIONS',
            'Options --browser, --html, and --json are mutually exclusive.',
            ['Choose one output mode, e.g. `td hc view id:360000269065 --json`.'],
        )
    }

    const fallbackLocale = (await readConfig()).hc?.defaultLocale
    const resolved = resolveHelpCenterRef(ref, {
        locale: options.locale,
        fallbackLocale,
    })

    if (options.browser && resolved.htmlUrl && !options.locale) {
        await openInBrowser(resolved.htmlUrl)
        return
    }

    let articleId: string
    if (resolved.kind === 'marketing') {
        const { marketingSlug, urlLocale } = resolved
        const resolvedMarketing = await withSpinner(
            { text: 'Resolving Help Center article...', color: 'blue' },
            () => resolveMarketingArticleId(marketingSlug, urlLocale),
        )
        articleId = resolvedMarketing.articleId

        if (options.browser) {
            await openInBrowser(resolvedMarketing.htmlUrl)
            return
        }
    } else {
        articleId = resolved.articleId
    }

    const article = await withSpinner(
        { text: 'Loading Help Center article...', color: 'blue' },
        () => getHelpCenterArticle(articleId, { locale: resolved.locale }),
    )

    if (options.browser) {
        await openInBrowser(article.htmlUrl)
        return
    }

    if (options.json) {
        console.log(JSON.stringify(article, null, 2))
        return
    }

    if (options.html) {
        process.stdout.write(article.bodyHtml)
        return
    }

    console.log(await renderMarkdown(formatHelpCenterArticleMarkdown(article)))
}
