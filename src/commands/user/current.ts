import { formatJson, formatNdjson } from '@doist/cli-core'
import { attachAccountCurrentCommand } from '@doist/cli-core/auth'
import chalk from 'chalk'
import type { Command } from 'commander'
import type { TodoistAccount, TodoistTokenStore } from '../../lib/auth-store.js'
import { resolveActiveUser } from '../../lib/auth.js'

/**
 * Attach `td accounts current` via cli-core's `attachAccountCurrentCommand`.
 *
 * A signed-in stored account resolves through `store.activeAccount()` and is
 * rendered by `renderText` / `renderJson`. The env-token and legacy
 * single-user sources live outside the store (so `activeAccount()` returns
 * `null` for them — env via the adapter's short-circuit, legacy because it has
 * no record), and are rendered in `onNotAuthenticated` via the read-side
 * resolver. The stored-case `--json` `source` is reported as `secure-store`;
 * the env/legacy sources are surfaced accurately by the fallback branch.
 */
export function attachTodoistUserCurrentCommand(
    parent: Command,
    store: TodoistTokenStore,
): Command {
    return attachAccountCurrentCommand<TodoistAccount>(parent, {
        store,
        description: 'Show the active account (resolved from --user, default, or single login)',
        renderText: ({ account, isDefault }) => {
            const marker = isDefault ? chalk.green(' (default)') : ''
            return `${account.email} ${chalk.dim(`(id:${account.id})`)}${marker}`
        },
        renderJson: ({ account, isDefault }) => ({
            id: account.id,
            email: account.email,
            source: 'secure-store',
            isDefault,
            authMode: account.auth_mode,
            authScope: account.auth_scope,
            authFlags: account.auth_flags,
        }),
        onNotAuthenticated: async ({ view }) => {
            // Nothing resolved in the store, so the active credential is
            // out-of-store (TODOIST_API_TOKEN or legacy single-user creds) — or
            // there's nothing at all, in which case `resolveActiveUser` throws
            // `NoTokenError`, matching the previous behaviour.
            const resolved = await resolveActiveUser()
            if (view.json || view.ndjson) {
                const payload = {
                    id: resolved.id === 'env' || resolved.id === 'legacy' ? null : resolved.id,
                    email: resolved.email || null,
                    source: resolved.source,
                    isDefault: false,
                    authMode: resolved.authMode,
                    authScope: resolved.authScope,
                    authFlags: resolved.authFlags,
                }
                console.log(view.json ? formatJson(payload) : formatNdjson([payload]))
                return
            }
            if (resolved.source === 'env') {
                console.log(
                    chalk.dim('Using TODOIST_API_TOKEN environment variable (no stored user).'),
                )
                return
            }
            if (resolved.id === 'legacy') {
                console.log(
                    chalk.dim(
                        'Using legacy single-user credentials. Run `td auth login` to migrate to a stored account.',
                    ),
                )
                return
            }
            console.log(`${resolved.email} ${chalk.dim(`(id:${resolved.id})`)}`)
        },
    })
}
