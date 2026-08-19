import chalk from 'chalk'
import { addFilter, type UpdateFilterArgs } from '../../lib/api/filters.js'
import { setViewOptions } from '../../lib/api/view-options.js'
import { isQuiet } from '../../lib/global-args.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import {
    describeViewOptions,
    parseViewOptionFlags,
    type ViewOptionFlags,
} from '../../lib/view-options.js'

export interface CreateOptions extends ViewOptionFlags {
    name: string
    query: string
    color?: UpdateFilterArgs['color']
    favorite?: boolean
    json?: boolean
    dryRun?: boolean
}

export async function createFilter(options: CreateOptions): Promise<void> {
    const viewOptions = parseViewOptionFlags(options)

    if (options.dryRun) {
        printDryRun('create filter', {
            Name: options.name,
            Query: options.query,
            Color: options.color,
            Favorite: options.favorite ? 'yes' : undefined,
            View: viewOptions ? describeViewOptions(viewOptions) : undefined,
        })
        return
    }

    const filter = await addFilter({
        name: options.name,
        query: options.query,
        color: options.color,
        isFavorite: options.favorite,
    })

    if (viewOptions) {
        await setViewOptions({ viewType: 'FILTER', objectId: filter.id, ...viewOptions })
    }

    if (options.json) {
        console.log(formatJson(filter, 'filter'))
        return
    }

    if (isQuiet()) {
        console.log(filter.id)
        return
    }

    console.log(`Created: ${filter.name}`)
    console.log(chalk.dim(`ID: id:${filter.id}`))
    console.log(chalk.dim(`Query: ${filter.query}`))
    if (viewOptions) console.log(chalk.dim(`View: ${describeViewOptions(viewOptions)}`))
}
