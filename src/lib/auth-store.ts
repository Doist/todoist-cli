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
 *   - `active()` / `activeBundle()` short-circuit to `null` when
 *     `TODOIST_API_TOKEN` is set. The env var is the canonical override
 *     across the CLI; without this short-circuit, `td auth status` would
 *     render the stored account while `getAuthMetadata()` reports
 *     `source: 'env'` (wrong account, right diagnostic). Both read paths must
 *     honour it so the bundle-aware `fetchLive` path agrees with `active()`.
 *   - `accountForUser` / `matchAccount` are passed explicitly. `matchAccount`
 *     delegates to `matchUserRef` so the keyring-store path and the
 *     config-driven `findUserByRef` path share one matcher (case-insensitive
 *     email + trim).
 *
 * Built with `Object.assign(Object.create(inner), …)` (the same pattern as
 * `withUserRefAware()`) so every method other than the two env-aware reads is
 * inherited from `inner` via the prototype chain — a future cli-core method
 * addition resolves automatically instead of being silently dropped.
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
    function envTokenSet(): boolean {
        return Boolean(process.env[TOKEN_ENV_VAR])
    }
    return Object.assign(Object.create(inner) as TodoistTokenStore, {
        active: async (ref?: AccountRef) => (envTokenSet() ? null : inner.active(ref)),
        activeBundle: async (ref?: AccountRef) => (envTokenSet() ? null : inner.activeBundle(ref)),
        // `accounts current` resolves through `activeAccount`; short-circuit it
        // on the env token too so env wins over a stored default (it routes to
        // the command's `onNotAuthenticated` env branch), matching `active`.
        activeAccount: async (ref?: AccountRef) =>
            envTokenSet() ? null : inner.activeAccount(ref),
    })
}
