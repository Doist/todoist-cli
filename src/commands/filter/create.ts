import chalk from 'chalk'
import { addFilter, type UpdateFilterArgs } from '../../lib/api/filters.js'
import { formatJson, printDryRun } from '../../lib/output.js'

export interface CreateOptions {
    name: string
    query: string
    color?: UpdateFilterArgs['color']
    favorite?: boolean
    json?: boolean
    dryRun?: boolean
}

export async function createFilter(options: CreateOptions): Promise<void> {
    if (options.dryRun) {
        printDryRun('create filter', {
            Name: options.name,
            Query: options.query,
            Color: options.color,
            Favorite: options.favorite ? 'yes' : undefined,
        })
        return
    }

    const filter = await addFilter({
        name: options.name,
        query: options.query,
        color: options.color,
        isFavorite: options.favorite,
    })

    if (options.json) {
        console.log(formatJson(filter, 'filter'))
        return
    }

    console.log(`Created: ${filter.name}`)
    console.log(chalk.dim(`ID: id:${filter.id}`))
    console.log(chalk.dim(`Query: ${filter.query}`))
}
