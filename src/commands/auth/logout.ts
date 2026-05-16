import { attachLogoutCommand } from '@doist/cli-core/auth'
import type { Command } from 'commander'
import type { TodoistAccount, TodoistTokenStore } from '../../lib/auth-store.js'
import { clearLegacyToken } from '../../lib/auth.js'
import { getRequestedUserRef } from '../../lib/global-args.js'
import { UserNotFoundError } from '../../lib/users.js'
import { logTokenStorageResult } from './helpers.js'

/**
 * Attach `td auth logout` via cli-core's generic `attachLogoutCommand`. The
 * registrar emits the success line (`✓ Logged out` / `{ok:true}` / silent
 * ndjson); we own two pieces on top:
 *
 *   1. **`--user <ref>` injection.** `index.ts` strips `--user` from
 *      `process.argv` before commander runs, so cli-core's own `extractUserRef`
 *      sees `undefined` and would clear the default. We wrap the store so
 *      `active(undefined)` / `clear(undefined)` substitute
 *      `getRequestedUserRef()` from global args, and surface a typed miss
 *      when the ref doesn't match a stored account.
 *
 *   2. **Legacy v1 clear.** When `td auth logout` lands on an unmigrated
 *      install (the cli-core `userRecords.list()` is empty but a legacy
 *      `api_token` / `api-token` keyring slot still exists), cli-core's clear
 *      is a no-op. Mirror the v1 read fallback in `resolveLegacyToken` by
 *      invoking `clearLegacyToken()` so a v1 user can actually log out before
 *      the migration runs. Removed alongside the read fallback once that
 *      transitional behaviour is dropped.
 *
 *   3. **Keyring-fallback warning.** cli-core's `TokenStore.clear: void`
 *      contract can't expose the storage location, so the adapter stashes it
 *      on `getLastClearResult` and we surface it via `onCleared`.
 */
export function attachTodoistLogoutCommand(auth: Command, store: TodoistTokenStore): Command {
    const refAwareStore = wrapStoreWithUserRef(store)
    return attachLogoutCommand<TodoistAccount>(auth, {
        store: refAwareStore,
        onCleared: ({ view }) => {
            const result = refAwareStore.getLastClearResult()
            if (!result) return
            logTokenStorageResult(
                result,
                'Stored token removed from the system credential manager',
                view.json || view.ndjson,
            )
        },
    })
}

function wrapStoreWithUserRef(store: TodoistTokenStore): TodoistTokenStore {
    let legacyResult: { storage: 'secure-store' | 'config-file'; warning?: string } | undefined
    return {
        ...store,
        active: (ref) => store.active(ref ?? getRequestedUserRef()),
        async clear(ref) {
            const targetRef = ref ?? getRequestedUserRef()

            // With an explicit ref we need a typed miss before we touch the
            // store — cli-core's contract is "clear(ref) is a no-op on miss",
            // which would otherwise let `logout --user mistake` print
            // `✓ Logged out` and exit 0.
            if (targetRef !== undefined) {
                const snapshot = await store.active(targetRef)
                if (!snapshot) throw new UserNotFoundError(targetRef)
            }

            legacyResult = undefined
            await store.clear(targetRef)
            if (store.getLastClearResult() !== undefined) return

            // No v2 record matched. With no explicit ref this is the
            // unmigrated-v1 path — try the legacy clear so the user actually
            // logs out. With an explicit ref we already threw above, so this
            // branch is only the empty-store-no-ref case.
            if (targetRef === undefined) {
                legacyResult = (await clearLegacyToken()) ?? undefined
            }
        },
        getLastClearResult: () => store.getLastClearResult() ?? legacyResult,
    }
}
