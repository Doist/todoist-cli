import { attachLogoutCommand } from '@doist/cli-core/auth'
import chalk from 'chalk'
import type { Command } from 'commander'
import type { TodoistAccount, TodoistTokenStore } from '../../lib/auth-store.js'
import { logTokenStorageResult } from './helpers.js'

/**
 * Attach `td auth logout` via cli-core's generic `attachLogoutCommand`. The
 * registrar emits the success line (`✓ Logged out` / `{ok:true}` / silent
 * ndjson); `onCleared` only surfaces the keyring-fallback warning carried by
 * `TokenStorageResult` — cli-core's `TokenStore.clear: void` contract can't
 * expose it directly, so we stash it on the adapter (`getLastClearResult`).
 */
export function attachTodoistLogoutCommand(auth: Command, store: TodoistTokenStore): Command {
    return attachLogoutCommand<TodoistAccount>(auth, {
        store,
        onCleared: ({ view }) => {
            const result = store.getLastClearResult()
            if (!result) return
            if (view.json || view.ndjson) {
                if (result.warning) console.error(chalk.yellow('Warning:'), result.warning)
            } else {
                logTokenStorageResult(
                    result,
                    'Stored token removed from the system credential manager',
                )
            }
        },
    })
}
