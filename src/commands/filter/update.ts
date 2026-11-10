import {
    type Filter,
    PartialFilterSaveError,
    type UpdateFilterArgs,
    updateFilter,
} from '../../lib/api/filters.js'
import { CliError } from '../../lib/errors.js'
import { isQuiet } from '../../lib/global-args.js'
import { printDryRun } from '../../lib/output.js'
import {
    type ParsedViewFlags,
    parseViewOptionFlags,
    type ViewOptionFlags,
} from '../../lib/view-options.js'
import { resolveFilterRef, tdCommand } from './helpers.js'

export interface UpdateOptions extends ViewOptionFlags {
    name?: string
    query?: string
    /** A string sets the description; `false` comes from `--no-description` and clears it. */
    description?: string | false
    color?: UpdateFilterArgs['color']
    favorite?: boolean
    dryRun?: boolean
}

export async function updateFilterCmd(nameOrId: string, options: UpdateOptions): Promise<void> {
    // Settle what's changing before looking the filter up: resolving it fetches
    // every filter, which a request that fails anyway shouldn't pay for.
    const view = parseViewOptionFlags(options)

    const args: UpdateFilterArgs = {}
    if (options.name) args.name = options.name
    if (options.query) args.query = options.query
    // `--no-description` arrives as false and clears the description; the API reads
    // an absent key as "leave it alone".
    if (options.description !== undefined)
        args.description = options.description === false ? null : options.description
    if (options.color) args.color = options.color
    if (options.favorite !== undefined) args.isFavorite = options.favorite

    if (Object.keys(args).length === 0 && !view) {
        throw new CliError('NO_CHANGES', 'No changes specified.')
    }

    const filter = await resolveFilterRef(nameOrId)

    if (options.dryRun) {
        printDryRun('update filter', {
            Filter: filter.name,
            Name: args.name,
            Query: args.query,
            Description: args.description === null ? '(cleared)' : args.description,
            Color: args.color,
            Favorite: args.isFavorite !== undefined ? String(args.isFavorite) : undefined,
            ...view?.summary,
        })
        return
    }

    try {
        await updateFilter(filter.id, args, view?.settings)
    } catch (error) {
        if (view && error instanceof PartialFilterSaveError) {
            throw partlyUpdated(filter, args.name, error, view)
        }
        throw error
    }
    if (!isQuiet())
        console.log(
            `Updated: ${filter.name}${options.name ? ` -> ${options.name}` : ''} (id:${filter.id})`,
        )
}

/**
 * Says which half of the update was saved. A retry goes by ID, because a
 * rename that went through means the old name no longer finds the filter.
 */
function partlyUpdated(
    filter: Filter,
    newName: string | undefined,
    error: PartialFilterSaveError,
    view: ParsedViewFlags,
): CliError {
    if (error.saved === 'view') {
        return new CliError(
            error.code,
            `Saved the view of filter "${filter.name}" (id:${filter.id}), but the filter itself was not updated: ${error.message}`,
            [
                ...(error.hints ?? []),
                'The view is saved: leave out the view flags if you run it again',
            ],
        )
    }
    const renamed = newName ? ` (now "${newName}")` : ''
    return new CliError(
        error.code,
        `Updated filter "${filter.name}"${renamed} (id:${filter.id}), but its view could not be saved: ${error.message}`,
        // A refused view fails again on a retry, so the API's own hints say what to change.
        error.refused
            ? error.hints
            : [
                  ...(error.hints ?? []),
                  `Save the view: ${tdCommand('filter', 'update', `id:${filter.id}`, ...view.flags)}`,
              ],
    )
}
