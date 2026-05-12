import type { AuthAccount, TokenStore } from '@doist/cli-core/auth'
import {
    clearApiToken,
    loadTokenForStoredUser,
    NoTokenError,
    type TokenStorageResult,
    TOKEN_ENV_VAR,
    upsertUser,
    type UpsertUserInput,
} from './auth.js'
import { type AuthFlag, type AuthMode, readConfig, type StoredUser } from './config.js'
import { SecureStoreUnavailableError } from './secure-store.js'
import { getDefaultUser, getStoredUsers } from './users.js'

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
 * auth provider's `validateToken` (post-handshake) and the token-store
 * `active()` adapter (post-read) so the persisted shape stays aligned with
 * what `set()` later disassembles via `accountToUpsertInput`.
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

/** Inverse of `toTodoistAccount` — feeds the upsert path that owns persistence. */
export function accountToUpsertInput(account: TodoistAccount, token: string): UpsertUserInput {
    return {
        id: account.id,
        email: account.email,
        token,
        authMode: account.auth_mode,
        authScope: account.auth_scope,
        authFlags: account.auth_flags,
    }
}

function storedUserToAccount(user: StoredUser): TodoistAccount {
    return toTodoistAccount({
        id: user.id,
        email: user.email,
        authMode: user.auth_mode ?? 'unknown',
        authScope: user.auth_scope,
        authFlags: user.auth_flags,
    })
}

/**
 * `TokenStore<TodoistAccount>` adapter that bridges cli-core's auth runtime
 * (which is single-user) to todoist's existing multi-user keyring + config
 * store. `set()` is exercised by `runOAuthFlow` during login; `active()` and
 * `clear()` are wired through for completeness so the public `TokenStore`
 * contract is honoured — per-user reads are still driven from the
 * todoist-local commands (logout, status, token, …).
 *
 * The factory also returns `getLastStorageResult()` so the login command can
 * surface keyring-fallback warnings (`upsertUser` reports them via the
 * `TokenStorageResult` payload that `set()` would otherwise have to swallow,
 * since cli-core's `TokenStore.set` signature is `void`).
 */
export type TodoistTokenStore = TokenStore<TodoistAccount> & {
    getLastStorageResult(): TokenStorageResult | undefined
    getLastClearResult(): TokenStorageResult | undefined
}

export function createTodoistTokenStore(): TodoistTokenStore {
    let lastStorageResult: TokenStorageResult | undefined
    let lastClearResult: TokenStorageResult | undefined

    return {
        /**
         * Pure view of persisted state. Deliberately ignores the global
         * `--user` selector (a CLI-invocation concern, not storage) and
         * returns `null` when `TODOIST_API_TOKEN` is in play (env tokens
         * don't represent a persisted account). When multiple accounts
         * are stored without a default, returns `null` rather than
         * throwing a selection error — the runtime caller can react to
         * "no active persisted account" but shouldn't see CLI-arg errors
         * leaking out of a store read.
         */
        async active() {
            if (process.env[TOKEN_ENV_VAR]) return null

            const config = await readConfig()
            const users = getStoredUsers(config)
            if (users.length === 0) return null

            const target = getDefaultUser(config) ?? (users.length === 1 ? users[0] : null)
            if (!target) return null

            try {
                const { token } = await loadTokenForStoredUser(target)
                return { token, account: storedUserToAccount(target) }
            } catch (error) {
                // Token unreachable (no secret, keyring offline) — surface as
                // "no active persisted account" so a `set()` retry can recover
                // without a runtime caller having to special-case storage errors.
                if (error instanceof NoTokenError) return null
                if (error instanceof SecureStoreUnavailableError) return null
                throw error
            }
        },

        async set(account, token) {
            const { replaced: _replaced, ...result } = await upsertUser(
                accountToUpsertInput(account, token),
            )
            lastStorageResult = result
        },

        async clear() {
            lastClearResult = await clearApiToken()
        },

        getLastStorageResult() {
            return lastStorageResult
        },

        getLastClearResult() {
            return lastClearResult
        },
    }
}
