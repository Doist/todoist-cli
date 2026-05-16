import {
    type AuthAccount,
    createKeyringTokenStore,
    type KeyringTokenStore,
} from '@doist/cli-core/auth'
import { type AuthFlag, type AuthMode, getConfigPath } from './config.js'
import { createTodoistUserRecordStore } from './user-records.js'

/**
 * Account shape stored by todoist-cli. Extends cli-core's `AuthAccount` with
 * the Todoist-specific identity + auth-mode metadata that ride alongside the
 * token in the per-user config record.
 */
export type TodoistAccount = AuthAccount & {
    email: string
    auth_mode: AuthMode
    auth_scope?: string
    auth_flags?: AuthFlag[]
}

export type TodoistAccountInput = {
    id: string
    email: string
    authMode: AuthMode
    authScope?: string
    authFlags?: AuthFlag[]
}

/**
 * Single source of truth for the `TodoistAccount` field layout. Used by the
 * auth provider's `validateToken` (post-handshake) and the migration helper.
 */
export function toTodoistAccount(input: TodoistAccountInput): TodoistAccount {
    return {
        id: input.id,
        email: input.email,
        label: input.email,
        auth_mode: input.authMode,
        auth_scope: input.authScope,
        auth_flags: input.authFlags,
    }
}

export type TodoistTokenStore = KeyringTokenStore<TodoistAccount>

/**
 * cli-core's keyring-backed `TokenStore`, wired to todoist-cli's
 * `UserRecordStore` adapter. The default `accountForUser` (`user-${id}`)
 * matches today's keyring slug, and the default `matchAccount` (id-or-label
 * equality) covers email-as-label refs because `toTodoistAccount` sets
 * `label = email`.
 */
export function createTodoistTokenStore(): TodoistTokenStore {
    return createKeyringTokenStore<TodoistAccount>({
        serviceName: 'todoist-cli',
        userRecords: createTodoistUserRecordStore(),
        recordsLocation: getConfigPath(),
    })
}
