import { getApiToken } from '../auth.js'
import { ensureFresh, markResourcesDirty, upsertCachedEntity } from '../sync/engine.js'
import { executeSyncCommand, generateUuid, type SyncCommand } from './core.js'

export interface Filter {
    id: string
    name: string
    query: string
    color?: string
    itemOrder?: number
    isFavorite: boolean
    isDeleted: boolean
}

interface FilterSyncResponse {
    filters?: Array<Record<string, unknown>>
    temp_id_mapping?: Record<string, string>
    error?: string
}

function parseFilter(f: Record<string, unknown>): Filter {
    return {
        id: String(f.id),
        name: String(f.name),
        query: String(f.query),
        color: f.color ? String(f.color) : undefined,
        itemOrder: f.item_order != null ? Number(f.item_order) : undefined,
        isFavorite: Boolean(f.is_favorite),
        isDeleted: Boolean(f.is_deleted),
    }
}

export async function fetchFilters(): Promise<Filter[]> {
    const repo = await ensureFresh(['filters'])
    if (repo) {
        return repo.listFilters()
    }

    const token = await getApiToken()
    const response = await fetch('https://api.todoist.com/api/v1/sync', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            sync_token: '*',
            resource_types: '["filters"]',
        }),
    })

    if (!response.ok) {
        throw new Error(`Failed to fetch filters: ${response.status}`)
    }

    const data: FilterSyncResponse = await response.json()
    if (data.error) {
        throw new Error(`Filters API error: ${data.error}`)
    }

    return (data.filters ?? []).map(parseFilter).filter((f: Filter) => !f.isDeleted)
}

export interface AddFilterArgs {
    name: string
    query: string
    color?: string
    isFavorite?: boolean
}

export async function addFilter(args: AddFilterArgs): Promise<Filter> {
    const tempId = generateUuid()
    const command: SyncCommand = {
        type: 'filter_add',
        uuid: generateUuid(),
        temp_id: tempId,
        args: {
            name: args.name,
            query: args.query,
            ...(args.color && { color: args.color }),
            ...(args.isFavorite !== undefined && { is_favorite: args.isFavorite }),
        },
    }

    const result = await executeSyncCommand([command])
    const mapping = result as {
        temp_id_mapping?: Record<string, string>
    }
    const id = mapping.temp_id_mapping?.[tempId] ?? tempId

    const created: Filter = {
        id,
        name: args.name,
        query: args.query,
        color: args.color,
        isFavorite: args.isFavorite ?? false,
        isDeleted: false,
    }

    await upsertCachedEntity({ resource: 'filters', value: created })
    return created
}

export interface UpdateFilterArgs {
    name?: string
    query?: string
    color?: string
    isFavorite?: boolean
}

export async function updateFilter(id: string, args: UpdateFilterArgs): Promise<void> {
    const updateArgs: Record<string, unknown> = { id }
    if (args.name !== undefined) updateArgs.name = args.name
    if (args.query !== undefined) updateArgs.query = args.query
    if (args.color !== undefined) updateArgs.color = args.color
    if (args.isFavorite !== undefined) updateArgs.is_favorite = args.isFavorite

    const command: SyncCommand = {
        type: 'filter_update',
        uuid: generateUuid(),
        args: updateArgs,
    }

    await executeSyncCommand([command])
    await markResourcesDirty(['filters'])
}

export async function deleteFilter(id: string): Promise<void> {
    const command: SyncCommand = {
        type: 'filter_delete',
        uuid: generateUuid(),
        args: { id },
    }

    await executeSyncCommand([command])
    await markResourcesDirty(['filters'])
}
