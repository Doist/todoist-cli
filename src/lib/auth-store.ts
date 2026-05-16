import {
    type AccountRef,
    type AuthAccount,
    createKeyringTokenStore,
    type KeyringTokenStore,
} from '@doist/cli-core/auth'
import { type AuthFlag, type AuthMode, getConfigPath } from './config.js'
import { createTodoistUserRecordStore } from './user-records.js'

/**
 * Persisted identifiers for the keyring/config ABI. Shared with the read-side
 * resolver (`auth.ts`) and the postinstall migration (`migrate-auth.ts`) so
 * a rename can't silently desynchronise the three paths that touch the OS
 * credential manager.
 */
export const SERVICE_NAME = 'todoist-cli'
export const LEGACY_ACCOUNT = 'api-token'
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
 * Case-insensitive email match on top of cli-core's default id-or-label
 * equality. `findUserByRef` (in `users.ts`) historically lowercased the email
 * compare; pin that behaviour explicitly here so a cli-core default change
 * can't drop it.
 */
function matchTodoistAccount(account: TodoistAccount, ref: AccountRef): boolean {
    if (account.id === ref) return true
    // `toTodoistAccount` always populates `label = email`, but cli-core types
    // it as optional — fall back to `email` to keep the case-insensitive
    // compare working even for accounts loaded from somewhere unexpected.
    const label = account.label ?? account.email
    return label.toLowerCase() === ref.toLowerCase()
}

/**
 * cli-core's keyring-backed `TokenStore`, wired to todoist-cli's
 * `UserRecordStore` adapter. `accountForUser` and `matchAccount` are passed
 * explicitly so the persisted keyring slot name + the `--user <ref>` match
 * rules are part of this module's contract, not inherited from cli-core's
 * defaults.
 */
export function createTodoistTokenStore(): TodoistTokenStore {
    return createKeyringTokenStore<TodoistAccount>({
        serviceName: SERVICE_NAME,
        userRecords: createTodoistUserRecordStore(),
        recordsLocation: getConfigPath(),
        accountForUser,
        matchAccount: matchTodoistAccount,
    })
}
