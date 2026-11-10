import {
    createCommand,
    type ColorKey,
    type Filter as SdkFilter,
    type SyncCommand,
    type ViewOptionsSetArgs,
} from '@doist/todoist-sdk'
import { CliError, SyncCommandError } from '../errors.js'
import { getApi, pickDefined } from './core.js'

export type Filter = SdkFilter

/**
 * A request that changed a filter and its view, where only one of the two
 * changes was saved. The Sync API applies each command on its own, so the one
 * that worked stays. It carries the code, message and hints of the change that
 * failed.
 */
export class PartialFilterSaveError extends CliError {
    constructor(
        cause: CliError,
        /** The filter, which exists whichever change failed. */
        readonly filterId: string,
        /** The change that was saved; the other one failed. */
        readonly saved: 'filter' | 'view',
        /** The API turned the failed change down, so sending it again would fail the same way. */
        readonly refused: boolean,
    ) {
        super(cause.code, cause.message, cause.hints, cause.type)
    }
}

type CommandFailure = Exclude<SyncCommandError['syncStatus'][string], 'ok'>

/** A 4xx other than rate limiting: the API looked at the command and said no. */
function isRefusal(failure: CommandFailure): boolean {
    return failure.httpCode >= 400 && failure.httpCode < 500 && failure.httpCode !== 429
}

/**
 * Turns a failed request holding a filter command and a view command into a
 * `PartialFilterSaveError` when exactly one of them was applied. Anything else,
 * including both failing, is passed on as it came.
 */
function toPartialSave(
    error: unknown,
    filterCommand: SyncCommand,
    viewCommand: SyncCommand,
    filterId?: string,
): unknown {
    if (!(error instanceof SyncCommandError)) return error
    const id = filterId ?? (filterCommand.tempId && error.tempIdMapping[filterCommand.tempId])
    const filterStatus = error.syncStatus[filterCommand.uuid]
    const viewStatus = error.syncStatus[viewCommand.uuid]
    if (!id || !filterStatus || !viewStatus) return error
    if (filterStatus === 'ok' && viewStatus !== 'ok') {
        return new PartialFilterSaveError(error, id, 'filter', isRefusal(viewStatus))
    }
    if (viewStatus === 'ok' && filterStatus !== 'ok') {
        return new PartialFilterSaveError(error, id, 'view', isRefusal(filterStatus))
    }
    return error
}

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

/**
 * Creates a filter, and saves its view in the same request. If the view fails
 * after the filter was created, the `PartialFilterSaveError` has its ID.
 */
export async function addFilter(args: AddFilterArgs, view?: FilterViewSettings): Promise<Filter> {
    const api = await getApi()
    const tempId = crypto.randomUUID()
    const addCommand = createCommand(
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
    )
    // The temp ID stands for the new filter until the server assigns one.
    const viewCommand = view && viewOptionsCommand(tempId, view)
    let response: Awaited<ReturnType<typeof api.sync>>
    try {
        response = await api.sync({
            commands: viewCommand ? [addCommand, viewCommand] : [addCommand],
        })
    } catch (error) {
        throw viewCommand ? toPartialSave(error, addCommand, viewCommand) : error
    }

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

/**
 * Changes to the filter and to its view go out in one request. If only one of
 * them is saved, the `PartialFilterSaveError` says which.
 */
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
    const filterCommand =
        Object.keys(changes).length > 0
            ? createCommand('filter_update', { id, ...changes })
            : undefined
    const viewCommand = view && viewOptionsCommand(id, view)
    const commands = [filterCommand, viewCommand].filter((command) => command !== undefined)

    const api = await getApi()
    try {
        await api.sync({ commands })
    } catch (error) {
        throw filterCommand && viewCommand
            ? toPartialSave(error, filterCommand, viewCommand, id)
            : error
    }
}

export async function deleteFilter(id: string): Promise<void> {
    const api = await getApi()
    await api.deleteFilter(id)
}
