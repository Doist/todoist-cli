import { attachLogoutCommand } from '@doist/cli-core/auth'
import type { Command } from 'commander'
import type { TodoistAccount, TodoistTokenStore } from '../../lib/auth-store.js'
import { logTokenStorageResult } from './helpers.js'

/**
 * `td auth logout`. cli-core owns the success line + `--json` / `--ndjson`
 * envelopes; the Todoist hook surfaces the keyring-fallback warning that
 * cli-core's `TokenStore.clear: void` contract can't carry. The `--user
 * <ref>` injection lives on the wrapped store the caller passes in (see
 * `withUserRefAware` in `store-wrap.ts`).
 */
export function attachTodoistLogoutCommand(auth: Command, store: TodoistTokenStore): Command {
    return attachLogoutCommand<TodoistAccount>(auth, {
        store,
        onCleared: ({ view }) => {
            const result = store.getLastClearResult()
            if (!result) return
            logTokenStorageResult(
                result,
                'Stored token removed from the system credential manager',
                view.json || view.ndjson,
            )
        },
    })
}
