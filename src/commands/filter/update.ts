import { type UpdateFilterArgs, updateFilter } from '../../lib/api/filters.js'
import { formatError, printDryRun } from '../../lib/output.js'
import { resolveFilterRef } from './helpers.js'

export interface UpdateOptions {
    name?: string
    query?: string
    color?: UpdateFilterArgs['color']
    favorite?: boolean
    dryRun?: boolean
}

export async function updateFilterCmd(nameOrId: string, options: UpdateOptions): Promise<void> {
    const filter = await resolveFilterRef(nameOrId)

    const args: UpdateFilterArgs = {}
    if (options.name) args.name = options.name
    if (options.query) args.query = options.query
    if (options.color) args.color = options.color
    if (options.favorite !== undefined) args.isFavorite = options.favorite

    if (Object.keys(args).length === 0) {
        throw new Error(formatError('NO_CHANGES', 'No changes specified.'))
    }

    if (options.dryRun) {
        printDryRun('update filter', {
            Filter: filter.name,
            Name: args.name,
            Query: args.query,
            Color: args.color,
            Favorite: args.isFavorite !== undefined ? String(args.isFavorite) : undefined,
        })
        return
    }

    await updateFilter(filter.id, args)
    console.log(`Updated: ${filter.name}${options.name ? ` -> ${options.name}` : ''}`)
}
