import type { AccountRef, AuthAccount, TokenStore } from '@doist/cli-core/auth'
import {
    clearApiToken,
    loadTokenForStoredUser,
    setDefaultUserId,
    type TokenStorageResult,
    TOKEN_ENV_VAR,
    upsertUser,
    type UpsertUserInput,
} from './auth.js'
import { type AuthFlag, type AuthMode, readConfig, type StoredUser } from './config.js'
import { findUserByRef, getEffectiveDefaultUser, getStoredUsers } from './users.js'

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
         * Pure view of persisted state. Returns `null` when `TODOIST_API_TOKEN`
         * is in play (env tokens don't represent a persisted account), when
         * nothing is stored, or when `ref` does not match any stored account
         * — cli-core's resolver layer translates the miss into a typed error.
         * With `ref`, returns that specific stored account; without, returns
         * the default-or-only account.
         *
         * Token-load failures (broken keyring, missing secret) propagate as
         * typed errors once a user was matched — collapsing them to `null`
         * would make a real account look like an unknown `ref` to cli-core.
         */
        async active(ref?: AccountRef) {
            if (process.env[TOKEN_ENV_VAR]) return null

            const config = await readConfig()
            const target =
                ref !== undefined
                    ? (findUserByRef(config, ref)?.user ?? null)
                    : getEffectiveDefaultUser(config)
            if (!target) return null

            const { token } = await loadTokenForStoredUser(target)
            return { token, account: storedUserToAccount(target) }
        },

        async set(account, token) {
            const { replaced: _replaced, ...result } = await upsertUser(
                accountToUpsertInput(account, token),
            )
            lastStorageResult = result
        },

        async clear(ref?: AccountRef) {
            lastClearResult = await clearApiToken({ ref })
        },

        async list() {
            const config = await readConfig()
            const users = getStoredUsers(config)
            if (users.length === 0) return []
            const defaultId = getEffectiveDefaultUser(config)?.id
            return users.map((user) => ({
                account: storedUserToAccount(user),
                isDefault: user.id === defaultId,
            }))
        },

        async setDefault(ref: AccountRef) {
            // `setDefaultUserId` accepts any ref (id or email) and throws
            // `UserNotFoundError` (a `CliError` with code `USER_NOT_FOUND`)
            // when the ref does not match any stored account.
            await setDefaultUserId(ref)
        },

        getLastStorageResult() {
            return lastStorageResult
        },

        getLastClearResult() {
            return lastClearResult
        },
    }
}
