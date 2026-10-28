import {
    createCommand,
    type SyncResponse,
    type UserStatus,
    type UserStatusArgs,
} from '@doist/todoist-sdk'
import { CliError } from '../errors.js'
import { getApi } from './core.js'

// A response without the user cannot tell "no status" from "nothing came back".
function readStatus(response: SyncResponse): UserStatus | null {
    if (!response.user) {
        throw new CliError(
            'API_ERROR',
            'Todoist did not return your user, so the status is unknown',
        )
    }
    return response.user.status ?? null
}

/** The caller's active status, or `null` when there is none or it has expired. */
export async function fetchUserStatus(): Promise<UserStatus | null> {
    const api = await getApi()
    return readStatus(await api.sync({ resourceTypes: ['user'], syncToken: '*' }))
}

/**
 * Updates supplied status fields (an object), or clears everything (`null`). Returns the status the server holds
 * afterwards, read in the same request, so the caller can check that the write is what it sent.
 */
export async function writeUserStatus(status: UserStatusArgs | null): Promise<UserStatus | null> {
    const api = await getApi()
    return readStatus(
        await api.sync({
            commands: [createCommand('user_update', { status })],
            resourceTypes: ['user'],
            syncToken: '*',
        }),
    )
}
