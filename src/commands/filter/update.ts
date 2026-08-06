import { type UpdateFilterArgs, updateFilter } from '../../lib/api/filters.js'
import { setViewOptions } from '../../lib/api/view-options.js'
import { CliError } from '../../lib/errors.js'
import { isQuiet } from '../../lib/global-args.js'
import { printDryRun } from '../../lib/output.js'
import {
    describeViewOptions,
    parseViewOptionFlags,
    type ViewOptionFlags,
} from '../../lib/view-options.js'
import { resolveFilterRef } from './helpers.js'

export interface UpdateOptions extends ViewOptionFlags {
    name?: string
    query?: string
    color?: UpdateFilterArgs['color']
    favorite?: boolean
    dryRun?: boolean
}

export async function updateFilterCmd(nameOrId: string, options: UpdateOptions): Promise<void> {
    const filter = await resolveFilterRef(nameOrId)
    const viewOptions = parseViewOptionFlags(options)

    const args: UpdateFilterArgs = {}
    if (options.name) args.name = options.name
    if (options.query) args.query = options.query
    if (options.color) args.color = options.color
    if (options.favorite !== undefined) args.isFavorite = options.favorite

    if (Object.keys(args).length === 0 && !viewOptions) {
        throw new CliError('NO_CHANGES', 'No changes specified.')
    }

    if (options.dryRun) {
        printDryRun('update filter', {
            Filter: filter.name,
            Name: args.name,
            Query: args.query,
            Color: args.color,
            Favorite: args.isFavorite !== undefined ? String(args.isFavorite) : undefined,
            View: viewOptions ? describeViewOptions(viewOptions) : undefined,
        })
        return
    }

    if (Object.keys(args).length > 0) {
        await updateFilter(filter.id, args)
    }
    if (viewOptions) {
        await setViewOptions({ viewType: 'FILTER', objectId: filter.id, ...viewOptions })
    }

    if (!isQuiet())
        console.log(
            `Updated: ${filter.name}${options.name ? ` -> ${options.name}` : ''} (id:${filter.id})`,
        )
}
