import { type UpdateFilterArgs, updateFilter } from '../../lib/api/filters.js'
import { CliError } from '../../lib/errors.js'
import { isQuiet } from '../../lib/global-args.js'
import { printDryRun } from '../../lib/output.js'
import { resolveFilterRef } from './helpers.js'

export interface UpdateOptions {
    name?: string
    query?: string
    /** A string sets the description; `false` comes from `--no-description` and clears it. */
    description?: string | false
    color?: UpdateFilterArgs['color']
    favorite?: boolean
    dryRun?: boolean
}

export async function updateFilterCmd(nameOrId: string, options: UpdateOptions): Promise<void> {
    const filter = await resolveFilterRef(nameOrId)

    const args: UpdateFilterArgs = {}
    if (options.name) args.name = options.name
    if (options.query) args.query = options.query
    // `--no-description` arrives as false and clears the description; the API reads
    // an absent key as "leave it alone".
    if (options.description !== undefined)
        args.description = options.description === false ? null : options.description
    if (options.color) args.color = options.color
    if (options.favorite !== undefined) args.isFavorite = options.favorite

    if (Object.keys(args).length === 0) {
        throw new CliError('NO_CHANGES', 'No changes specified.')
    }

    if (options.dryRun) {
        printDryRun('update filter', {
            Filter: filter.name,
            Name: args.name,
            Query: args.query,
            Description: args.description === null ? '(cleared)' : args.description,
            Color: args.color,
            Favorite: args.isFavorite !== undefined ? String(args.isFavorite) : undefined,
        })
        return
    }

    await updateFilter(filter.id, args)
    if (!isQuiet())
        console.log(
            `Updated: ${filter.name}${options.name ? ` -> ${options.name}` : ''} (id:${filter.id})`,
        )
}
