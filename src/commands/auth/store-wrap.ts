import type { TodoistTokenStore } from '../../lib/auth-store.js'
import { getRequestedUserRef } from '../../lib/global-args.js'
import { UserNotFoundError } from '../../lib/users.js'

/**
 * Substitute `getRequestedUserRef()` for missing `ref` arguments on
 * `active` / `clear`. `index.ts` strips `--user` from argv before commander
 * runs, so the cli-core registrars (`attachLogoutCommand`,
 * `attachTokenViewCommand`) can't see the flag on their parsed args; this
 * wrap puts the global selector back into play.
 *
 * Also turns "ref didn't match anything" into a typed `UserNotFoundError`
 * instead of cli-core's null-on-miss contract, so `logout --user mistake`
 * doesn't silently print `✓ Logged out`.
 */
export function withUserRefAware(store: TodoistTokenStore): TodoistTokenStore {
    return {
        ...store,
        active: (ref) => store.active(ref ?? getRequestedUserRef()),
        async clear(ref) {
            const targetRef = ref ?? getRequestedUserRef()
            if (targetRef !== undefined && !(await store.active(targetRef))) {
                throw new UserNotFoundError(targetRef)
            }
            await store.clear(targetRef)
        },
    }
}
