import type { ColorKey } from '@doist/todoist-sdk'
import { getApi } from '../../lib/api/core.js'
import { formatError, formatJson, isQuiet, printDryRun } from '../../lib/output.js'
import { resolveLabelRef } from './helpers.js'

export interface UpdateLabelOptions {
    name?: string
    color?: ColorKey
    favorite?: boolean
    json?: boolean
    dryRun?: boolean
}

export async function updateLabel(nameOrId: string, options: UpdateLabelOptions): Promise<void> {
    const label = await resolveLabelRef(nameOrId)

    const args: {
        name?: string
        color?: ColorKey
        isFavorite?: boolean
    } = {}
    if (options.name) args.name = options.name
    if (options.color) args.color = options.color
    if (options.favorite === true) args.isFavorite = true
    if (options.favorite === false) args.isFavorite = false

    if (Object.keys(args).length === 0) {
        throw new Error(formatError('NO_CHANGES', 'No changes specified.'))
    }

    if (options.dryRun) {
        printDryRun('update label', {
            Label: `@${label.name}`,
            Name: args.name ? `@${args.name}` : undefined,
            Color: args.color,
            Favorite: args.isFavorite !== undefined ? String(args.isFavorite) : undefined,
        })
        return
    }

    const api = await getApi()
    const updated = await api.updateLabel(label.id, args)

    if (options.json) {
        console.log(formatJson(updated, 'label'))
        return
    }

    if (!isQuiet())
        console.log(
            `Updated: @${label.name}${options.name ? ` → @${updated.name}` : ''} (id:${label.id})`,
        )
}
