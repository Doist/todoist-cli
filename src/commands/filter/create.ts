import chalk from 'chalk'
import {
    addFilter,
    deleteFilter,
    type Filter,
    PartialFilterSaveError,
    type UpdateFilterArgs,
} from '../../lib/api/filters.js'
import { CliError } from '../../lib/errors.js'
import { isQuiet } from '../../lib/global-args.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import {
    type ParsedViewFlags,
    parseViewOptionFlags,
    type ViewOptionFlags,
} from '../../lib/view-options.js'
import { tdCommand } from './helpers.js'

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

    let filter: Filter
    try {
        filter = await addFilter(
            {
                name: options.name,
                query: options.query,
                description: options.description,
                color: options.color,
                isFavorite: options.favorite,
            },
            view?.settings,
        )
    } catch (error) {
        if (view && error instanceof PartialFilterSaveError) {
            throw await viewNotSaved(options.name, error, view)
        }
        throw error
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
    for (const [label, value] of Object.entries(view?.summary ?? {})) {
        console.log(chalk.dim(`${label}: ${value}`))
    }
}

/**
 * The filter was created but its view was not saved. A view the API refused
 * would be refused again on every retry, so the filter is deleted and the
 * command fails as a whole: running it again can't leave a second filter
 * behind. Any other failure keeps the filter and says how to save its view.
 */
async function viewNotSaved(
    name: string,
    error: PartialFilterSaveError,
    view: ParsedViewFlags,
): Promise<CliError> {
    const id = error.filterId
    if (!error.refused) {
        return new CliError(
            error.code,
            `Created filter "${name}" (id:${id}), but its view could not be saved: ${error.message}`,
            [
                ...(error.hints ?? []),
                `Save the view without creating the filter again: ${tdCommand('filter', 'update', `id:${id}`, ...view.flags)}`,
            ],
        )
    }
    try {
        await deleteFilter(id)
    } catch {
        return new CliError(
            error.code,
            `Created filter "${name}" (id:${id}), but its view was refused: ${error.message}`,
            [
                ...(error.hints ?? []),
                `Delete the filter: ${tdCommand('filter', 'delete', `id:${id}`, '--yes')}`,
            ],
        )
    }
    return new CliError(
        error.code,
        `Filter "${name}" was not created, because its view was refused: ${error.message}`,
        error.hints,
    )
}
