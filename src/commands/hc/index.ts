import { Command } from 'commander'
import { listHelpCenterLocales } from './locales.js'
import { searchHelpCenterArticles } from './search.js'
import { viewHelpCenterArticle } from './view.js'

const LOCALE_OPTION_DESCRIPTION = 'Help Center locale (default: en-us)'

export function registerHelpCenterCommand(program: Command): void {
    const hc = program
        .command('hc')
        .description('Search Todoist Help Center articles')
        .addHelpText(
            'after',
            `
Examples:
  td hc locales
  td hc locales --json
  td hc search "notifications"
  td hc search "reminders" --locale pt-br --json
  td hc view id:360000269065
  td hc view 360000269065
  td hc view https://get.todoist.help/hc/en-us/articles/360000269065

Notes:
  search prints real Help Center article IDs
  view accepts id:N, raw article IDs, and Help Center URLs`,
        )

    hc.command('locales')
        .description('List supported Help Center locales')
        .option('--json', 'Output as JSON')
        .action(listHelpCenterLocales)

    const searchCmd = hc
        .command('search [query]')
        .description('Search Todoist Help Center articles')
        .option('--locale <locale>', LOCALE_OPTION_DESCRIPTION)
        .option('--limit <n>', 'Number of results to return (default: 10, max: 25)')
        .option('--json', 'Output as JSON')
        .action((query, options) => {
            if (!query) {
                searchCmd.help()
                return
            }
            return searchHelpCenterArticles(query, options)
        })

    const viewCmd = hc
        .command('view [ref]', { isDefault: true })
        .description('View a Help Center article by id:N, raw article ID, or URL')
        .option('--locale <locale>', LOCALE_OPTION_DESCRIPTION)
        .option('--browser', 'Open the article in your browser')
        .option('--json', 'Output as JSON')
        .option('--html', 'Output the raw HTML article body')
        .action((ref, options) => {
            if (!ref) {
                viewCmd.help()
                return
            }
            return viewHelpCenterArticle(ref, options)
        })
}
