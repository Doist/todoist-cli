import { createCommand, type Filter as SdkFilter } from '@doist/todoist-api-typescript'
import { getApi, pickDefined } from './core.js'

export type Filter = SdkFilter

export interface AddFilterArgs {
    name: string
    query: string
    color?: string
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
    color?: string
    isFavorite?: boolean
}

export async function updateFilter(id: string, args: UpdateFilterArgs): Promise<void> {
    const api = await getApi()
    await api.sync({
        commands: [
            createCommand('filter_update', {
                id,
                ...pickDefined({
                    name: args.name,
                    query: args.query,
                    color: args.color,
                    isFavorite: args.isFavorite,
                }),
            }),
        ],
    })
}

export async function deleteFilter(id: string): Promise<void> {
    const api = await getApi()
    await api.sync({
        commands: [createCommand('filter_delete', { id })],
    })
}
