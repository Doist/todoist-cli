import chalk from 'chalk'
import { searchHelpCenter } from '../../lib/help-center.js'
import { withSpinner } from '../../lib/spinner.js'
import { resolveDefaultHelpCenterLocale } from './locale.js'

export interface SearchHelpCenterOptions {
    json?: boolean
    limit?: string
    locale?: string
}

export async function searchHelpCenterArticles(
    query: string,
    options: SearchHelpCenterOptions = {},
): Promise<void> {
    const trimmedQuery = query.trim()
    const locale = await resolveDefaultHelpCenterLocale(options.locale)
    const results = await withSpinner({ text: 'Searching Help Center...', color: 'blue' }, () =>
        searchHelpCenter(trimmedQuery, { locale, limit: options.limit }),
    )

    if (options.json) {
        console.log(JSON.stringify(results, null, 2))
        return
    }

    if (results.length === 0) {
        console.log(`No Help Center articles found for "${trimmedQuery}".`)
        return
    }

    for (const [index, result] of results.entries()) {
        console.log(result.title)
        console.log(`   ${chalk.dim(`id:${result.id}`)}`)
        console.log(`   ${chalk.dim(result.htmlUrl)}`)
        if (result.snippet) {
            console.log(`   ${result.snippet}`)
        }
        if (index < results.length - 1) {
            console.log('')
        }
    }
}
