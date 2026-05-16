import {
    type AccountRef,
    type AuthAccount,
    createKeyringTokenStore,
    type KeyringTokenStore,
} from '@doist/cli-core/auth'
import { type AuthFlag, type AuthMode, getConfigPath } from './config.js'
import { createTodoistUserRecordStore } from './user-records.js'
import { matchUserRef } from './users.js'

/**
 * Persisted identifiers for the keyring/config ABI. Shared with the read-side
 * resolver (`auth.ts`) and the postinstall migration (`migrate-auth.ts`) so
 * a rename can't silently desynchronise the three paths that touch the OS
 * credential manager.
 */
export const SERVICE_NAME = 'todoist-cli'
export const LEGACY_ACCOUNT = 'api-token'
export const TOKEN_ENV_VAR = 'TODOIST_API_TOKEN'
export function accountForUser(id: string): string {
    return `user-${id}`
}

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
 * auth provider's `validateToken` (post-handshake), the migration helper,
 * and the `UserRecordStore` adapter's record → account mapping.
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
 * `UserRecordStore` adapter. Two Todoist-specific overlays on top of the
 * defaults:
 *
 *   - `active()` short-circuits to `null` when `TODOIST_API_TOKEN` is set.
 *     The env var is the canonical override across the CLI; without this
 *     short-circuit, `td auth status` would render the stored account while
 *     `getAuthMetadata()` reports `source: 'env'` (wrong account, right
 *     diagnostic).
 *   - `accountForUser` / `matchAccount` are passed explicitly. `matchAccount`
 *     delegates to `matchUserRef` so the keyring-store path and the
 *     config-driven `findUserByRef` path share one matcher (case-insensitive
 *     email + trim).
 */
export function createTodoistTokenStore(): TodoistTokenStore {
    const inner = createKeyringTokenStore<TodoistAccount>({
        serviceName: SERVICE_NAME,
        userRecords: createTodoistUserRecordStore(),
        recordsLocation: getConfigPath(),
        accountForUser,
        matchAccount: (account: TodoistAccount, ref: AccountRef) =>
            matchUserRef({ id: account.id, email: account.email }, ref),
    })
    return {
        active: async (ref) => {
            if (process.env[TOKEN_ENV_VAR]) return null
            return inner.active(ref)
        },
        set: (account, token) => inner.set(account, token),
        clear: (ref) => inner.clear(ref),
        list: () => inner.list(),
        setDefault: (ref) => inner.setDefault(ref),
        getLastStorageResult: () => inner.getLastStorageResult(),
        getLastClearResult: () => inner.getLastClearResult(),
    }
}
