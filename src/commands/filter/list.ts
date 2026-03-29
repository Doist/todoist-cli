import chalk from 'chalk'
import { fetchFilters } from '../../lib/api/filters.js'
import type { PaginatedViewOptions } from '../../lib/options.js'
import { formatPaginatedJson, formatPaginatedNdjson, isAccessible } from '../../lib/output.js'
import { filterUrl } from '../../lib/urls.js'

export async function listFilters(options: PaginatedViewOptions): Promise<void> {
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
