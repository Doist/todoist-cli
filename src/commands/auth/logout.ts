import { attachLogoutCommand } from '@doist/cli-core/auth'
import type { Command } from 'commander'
import type { TodoistAccount, TodoistTokenStore } from '../../lib/auth-store.js'
import { logTokenStorageResult } from './helpers.js'
import { withUserRefAware } from './store-wrap.js'

/**
 * `td auth logout`. cli-core owns the success line + `--json` / `--ndjson`
 * envelopes; the Todoist wrap threads `--user <ref>` from global args
 * (`withUserRefAware`) and surfaces the keyring-fallback warning that
 * cli-core's `TokenStore.clear: void` contract can't carry.
 */
export function attachTodoistLogoutCommand(auth: Command, store: TodoistTokenStore): Command {
    const refAware = withUserRefAware(store)
    return attachLogoutCommand<TodoistAccount>(auth, {
        store: refAware,
        onCleared: ({ view }) => {
            const result = refAware.getLastClearResult()
            if (!result) return
            logTokenStorageResult(
                result,
                'Stored token removed from the system credential manager',
                view.json || view.ndjson,
            )
        },
    })
}
