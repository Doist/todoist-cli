import chalk from 'chalk'
import { Command } from 'commander'
import { fetchFilters } from '../lib/api/filters.js'
import type { ViewOptions } from '../lib/options.js'
import { formatPaginatedJson, formatPaginatedNdjson, isAccessible } from '../lib/output.js'
import { filterUrl } from '../lib/urls.js'

async function listFilters(options: ViewOptions): Promise<void> {
    const filters = await fetchFilters()

    if (options.json) {
        console.log(
            formatPaginatedJson(
                { results: filters, nextCursor: null },
                'filter',
                options.full,
                options.showUrls,
            ),
        )
        return
    }

    if (options.ndjson) {
        console.log(
            formatPaginatedNdjson(
                { results: filters, nextCursor: null },
                'filter',
                options.full,
                options.showUrls,
            ),
        )
        return
    }

    if (filters.length === 0) {
        console.log('No filters found.')
        return
    }

    for (const filter of filters) {
        const id = chalk.dim(`id:${filter.id}`)
        const name = filter.isFavorite
            ? chalk.yellow(`${filter.name}${isAccessible() ? ' ★' : ''}`)
            : filter.name
        const query = chalk.dim(`"${filter.query}"`)
        console.log(`${id}  ${name}  ${query}`)
        if (options.showUrls) {
            console.log(`  ${chalk.dim(filterUrl(filter.id))}`)
        }
    }
}

export function registerFiltersCommand(program: Command): void {
    const filters = program.command('filters').description('List saved filters')

    filters
        .command('list', { isDefault: true })
        .description('List all filters')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .option('--show-urls', 'Show web app URLs for each filter')
        .action(listFilters)
}
