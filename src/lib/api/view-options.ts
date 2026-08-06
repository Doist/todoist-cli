import { createCommand, type ViewType } from '@doist/todoist-sdk'
import type { ParsedViewOptions } from '../view-options.js'
import { getApi, pickDefined } from './core.js'

export interface SetViewOptionsArgs extends ParsedViewOptions {
    viewType: ViewType
    objectId?: string
}

/**
 * Sets the presentation of a view (layout, grouping, sorting).
 *
 * View options are stored per user, so this only affects the authenticated
 * account even when the underlying object is shared.
 */
export async function setViewOptions(args: SetViewOptionsArgs): Promise<void> {
    const api = await getApi()
    await api.sync({
        commands: [
            createCommand('view_options_set', {
                viewType: args.viewType,
                ...pickDefined({
                    objectId: args.objectId,
                    viewMode: args.viewMode,
                    groupedBy: args.groupedBy,
                    sortedBy: args.sortedBy,
                    sortOrder: args.sortOrder,
                }),
            }),
        ],
    })
}
