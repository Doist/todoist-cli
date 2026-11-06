import chalk from 'chalk'
import {
    addFilter,
    type Filter,
    type UpdateFilterArgs,
    updateFilter,
} from '../../lib/api/filters.js'
import { CliError } from '../../lib/errors.js'
import { getRequestedUserRef, isQuiet } from '../../lib/global-args.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import {
    type ParsedViewFlags,
    parseViewOptionFlags,
    type ViewOptionFlags,
} from '../../lib/view-options.js'

export interface CreateOptions extends ViewOptionFlags {
    name: string
    query: string
    description?: string
    color?: UpdateFilterArgs['color']
    favorite?: boolean
    json?: boolean
    dryRun?: boolean
}

export async function createFilter(options: CreateOptions): Promise<void> {
    const view = parseViewOptionFlags(options)

    if (options.dryRun) {
        printDryRun('create filter', {
            Name: options.name,
            Query: options.query,
            Description: options.description,
            Color: options.color,
            Favorite: options.favorite ? 'yes' : undefined,
            ...view?.summary,
        })
        return
    }

    const filter = await addFilter({
        name: options.name,
        query: options.query,
        description: options.description,
        color: options.color,
        isFavorite: options.favorite,
    })
    if (view) await saveView(filter, view)

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
    for (const [label, value] of Object.entries(view?.summary ?? {})) {
        console.log(chalk.dim(`${label}: ${value}`))
    }
}

/**
 * The view goes in a request of its own, after the filter exists. The Sync
 * API applies batched commands one by one, so in a single batch a failed view
 * would still leave the filter created, behind an error that never names it,
 * and running the command again would create a second one.
 */
async function saveView(filter: Filter, view: ParsedViewFlags): Promise<void> {
    try {
        await updateFilter(filter.id, {}, view.settings)
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        // Without the account the filter went to, the retry would look for it
        // in the default account.
        const user = getRequestedUserRef()
        const td = user ? `td --user ${user}` : 'td'
        throw new CliError(
            error instanceof CliError ? error.code : 'API_ERROR',
            `Created filter "${filter.name}" (id:${filter.id}), but its view could not be saved: ${reason}`,
            [
                `Save the view without creating the filter again: ${td} filter update id:${filter.id} ${view.flags.join(' ')}`,
            ],
        )
    }
}
