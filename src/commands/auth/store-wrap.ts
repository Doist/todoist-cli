import type { TodoistTokenStore } from '../../lib/auth-store.js'
import { getRequestedUserRef } from '../../lib/global-args.js'
import { matchUserRef, UserNotFoundError } from '../../lib/users.js'

/**
 * Substitute `getRequestedUserRef()` for missing `ref` arguments on
 * `active` / `clear`. `index.ts` strips `--user` from argv before commander
 * runs, so cli-core's registrars (`attachLogoutCommand`,
 * `attachTokenViewCommand`) can't see the flag on their parsed args; this
 * wrap puts the global selector back into play.
 *
 * Existence is checked via `store.list()` rather than `store.active()` — the
 * latter loads the token and can throw `SecureStoreUnavailableError` when
 * the keyring is offline, which would crash `td auth logout --user <ref>`
 * instead of letting it clear the broken credential.
 *
 * The wrap is built with `Object.assign(Object.create(store), …)` so any
 * methods cli-core might later promote to a prototype still resolve via the
 * prototype chain instead of being silently dropped by a spread.
 */
export function withUserRefAware(store: TodoistTokenStore): TodoistTokenStore {
    async function requireExists(ref: string): Promise<void> {
        const records = await store.list()
        if (
            !records.some(({ account }) =>
                matchUserRef({ id: account.id, email: account.email }, ref),
            )
        ) {
            throw new UserNotFoundError(ref)
        }
    }

    return Object.assign(Object.create(store) as TodoistTokenStore, {
        active: async (ref?: string) => {
            const targetRef = ref ?? getRequestedUserRef()
            if (targetRef !== undefined) await requireExists(targetRef)
            return store.active(targetRef)
        },
        clear: async (ref?: string) => {
            const targetRef = ref ?? getRequestedUserRef()
            if (targetRef !== undefined) await requireExists(targetRef)
            await store.clear(targetRef)
        },
    })
}
