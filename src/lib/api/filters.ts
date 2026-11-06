import {
    createCommand,
    type ColorKey,
    type Filter as SdkFilter,
    type SyncCommand,
    type ViewOptionsSetArgs,
} from '@doist/todoist-sdk'
import { getApi, pickDefined } from './core.js'

export type Filter = SdkFilter

/**
 * How the filter's tasks are laid out, grouped and sorted. View options are
 * saved per user, so this only changes the authenticated account's view.
 */
export type FilterViewSettings = Omit<ViewOptionsSetArgs, 'viewType' | 'objectId'>

function viewOptionsCommand(filterId: string, view: FilterViewSettings): SyncCommand {
    return createCommand('view_options_set', { viewType: 'FILTER', objectId: filterId, ...view })
}

export interface AddFilterArgs {
    name: string
    query: string
    description?: string
    color?: ColorKey
    isFavorite?: boolean
}

export async function fetchFilters(): Promise<Filter[]> {
    const api = await getApi()
    const response = await api.sync({
        resourceTypes: ['filters'],
        syncToken: '*',
    })
    return (response.filters ?? []).filter((f) => !f.isDeleted)
}

export async function addFilter(args: AddFilterArgs): Promise<Filter> {
    const api = await getApi()
    const tempId = crypto.randomUUID()
    const response = await api.sync({
        commands: [
            createCommand(
                'filter_add',
                {
                    name: args.name,
                    query: args.query,
                    ...pickDefined({
                        description: args.description,
                        color: args.color,
                        isFavorite: args.isFavorite,
                    }),
                },
                tempId,
            ),
        ],
    })

    const id = response.tempIdMapping?.[tempId] ?? tempId
    return {
        id,
        name: args.name,
        query: args.query,
        description: args.description ?? null,
        color: args.color ?? 'charcoal',
        isFavorite: args.isFavorite ?? false,
        isDeleted: false,
        isFrozen: false,
        itemOrder: 0,
    }
}

export interface UpdateFilterArgs {
    name?: string
    query?: string
    /** `null` clears an existing description; omitting the key leaves it alone. */
    description?: string | null
    color?: ColorKey
    isFavorite?: boolean
}

/** Changes to the filter and to its view go out in one request. */
export async function updateFilter(
    id: string,
    args: UpdateFilterArgs,
    view?: FilterViewSettings,
): Promise<void> {
    const changes = pickDefined({
        name: args.name,
        query: args.query,
        description: args.description,
        color: args.color,
        isFavorite: args.isFavorite,
    })
    const commands: SyncCommand[] = []
    if (Object.keys(changes).length > 0) {
        commands.push(createCommand('filter_update', { id, ...changes }))
    }
    if (view) commands.push(viewOptionsCommand(id, view))

    const api = await getApi()
    await api.sync({ commands })
}

export async function deleteFilter(id: string): Promise<void> {
    const api = await getApi()
    await api.deleteFilter(id)
}
