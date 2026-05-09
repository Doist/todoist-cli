import type { AuthAccount, TokenStore } from '@doist/cli-core/auth'
import { clearApiToken, NoTokenError, resolveActiveUser, upsertUser } from './auth.js'
import { type AuthFlag, type AuthMode } from './config.js'

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

/**
 * `TokenStore<TodoistAccount>` adapter that bridges cli-core's auth runtime
 * (which is single-user) to todoist's existing multi-user keyring + config
 * store. Only `set()` is exercised by `runOAuthFlow` during login — the other
 * methods are wired through to todoist's primitives so the public `TokenStore`
 * contract is honoured even though listings + per-user reads are driven from
 * the todoist-local commands (logout, status, token, …).
 */
export function createTodoistTokenStore(): TokenStore<TodoistAccount> {
    return {
        async active() {
            try {
                const user = await resolveActiveUser()
                return {
                    token: user.token,
                    account: {
                        id: user.id,
                        email: user.email,
                        label: user.email,
                        auth_mode: user.authMode,
                        auth_scope: user.authScope,
                        auth_flags: user.authFlags,
                    },
                }
            } catch (error) {
                if (error instanceof NoTokenError) return null
                throw error
            }
        },

        async set(account, token) {
            await upsertUser({
                id: account.id,
                email: account.email,
                token,
                authMode: account.auth_mode,
                authScope: account.auth_scope,
                authFlags: account.auth_flags,
            })
        },

        async clear() {
            await clearApiToken()
        },
    }
}
