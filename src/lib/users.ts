import type { Config, StoredUser } from './config.js'
import { CliError } from './errors.js'

export class UserNotFoundError extends CliError {
    constructor(ref: string) {
        super(
            'USER_NOT_FOUND',
            `No stored user matches "${ref}". Use \`td accounts list\` to see authenticated accounts.`,
            [
                'Run `td auth login` to add an account, or `td accounts list` to inspect existing ones',
            ],
            'info',
        )
        this.name = 'UserNotFoundError'
    }
}

export class NoUserSelectedError extends CliError {
    constructor() {
        super(
            'NO_USER_SELECTED',
            'Multiple Todoist accounts are stored. Specify which one to use.',
            [
                'Pass `--user <id|email>` on the command, or',
                'Set a default with `td accounts use <id|email>`',
            ],
            'info',
        )
        this.name = 'NoUserSelectedError'
    }
}

export function getStoredUsers(config: Config): StoredUser[] {
    return Array.isArray(config.users) ? config.users : []
}

export function getDefaultUserId(config: Config): string | undefined {
    return config.user?.defaultUser
}

/**
 * The account that resolves as default when no `--user` is given: the pinned
 * `defaultUser`, or — when nothing is pinned — the sole stored account (a lone
 * account is implicitly default). Mirrors cli-core's `TokenStore.list()`
 * effective-default rule so the `(default)` marker is identical across
 * `accounts list`, `accounts current`, `auth status`, and `config view`.
 *
 * `getDefaultUserId` (the raw pinned pointer) is still the right call where the
 * pin itself matters — e.g. `accounts remove` deciding whether it cleared a
 * pin, or `doctor` diagnosing whether the pin resolves.
 */
/**
 * The account that resolves as default when no `--user` is given: the pinned
 * `defaultUser` when it points at a stored account, otherwise — falling through
 * an orphaned pin — the sole stored account (a lone account is implicitly
 * default), or `undefined` when neither applies.
 *
 * Single source of truth for the default-selection rule: `resolveActiveUser`
 * (`auth.ts`) and `getEffectiveDefaultUserId` both call this so the active-user
 * resolver and the `(default)` marker can't drift.
 */
export function getEffectiveDefaultUser(config: Config): StoredUser | undefined {
    const users = getStoredUsers(config)
    const pinned = getDefaultUserId(config)
    if (pinned) {
        const found = users.find((u) => u.id === pinned)
        if (found) return found
        // Pinned pointer is orphaned — fall through to the sole-account rule.
    }
    return users.length === 1 ? users[0] : undefined
}

export function getEffectiveDefaultUserId(config: Config): string | undefined {
    return getEffectiveDefaultUser(config)?.id
}

/**
 * Single source of truth for `--user <ref>` matching: exact id, or
 * case-insensitive email. Both `findUserByRef` (config-driven path) and
 * `auth-store.ts`'s cli-core `matchAccount` (keyring-store path) delegate
 * here so the two routes can't drift.
 */
export function matchUserRef(user: { id: string; email: string }, ref: string): boolean {
    const trimmed = ref.trim()
    if (!trimmed) return false
    if (user.id === trimmed) return true
    return user.email.toLowerCase() === trimmed.toLowerCase()
}

/**
 * Resolve a user ref against the on-disk config. Returns `null` on miss;
 * the call sites that need to fail loudly wrap with `requireUserByRef`.
 */
export function findUserByRef(
    config: Config,
    ref: string,
): { user: StoredUser; index: number } | null {
    const users = getStoredUsers(config)
    const idx = users.findIndex((u) => matchUserRef(u, ref))
    return idx !== -1 ? { user: users[idx], index: idx } : null
}

export function requireUserByRef(config: Config, ref: string): { user: StoredUser; index: number } {
    const found = findUserByRef(config, ref)
    if (!found) throw new UserNotFoundError(ref)
    return found
}

// ---------------------------------------------------------------------------
// Pure mutators — driven by the `UserRecordStore` adapter in `user-records.ts`.
// Kept here (not inlined) so the on-disk config layout has one set of array +
// default-pointer manipulators across the codebase.
// ---------------------------------------------------------------------------

export function upsertStoredUser(
    config: Config,
    next: StoredUser,
): { config: Config; replaced: boolean } {
    const users = getStoredUsers(config).slice()
    const idx = users.findIndex((u) => u.id === next.id)
    const replaced = idx !== -1
    if (replaced) users[idx] = next
    else users.push(next)
    return { config: { ...config, users }, replaced }
}

export function removeStoredUser(config: Config, id: string): Config {
    const users = getStoredUsers(config).filter((u) => u.id !== id)
    const next: Config = { ...config, users }
    if (next.user?.defaultUser === id) return clearDefaultUser(next)
    return next
}

export function setDefaultUser(config: Config, id: string): Config {
    return { ...config, user: { ...config.user, defaultUser: id } }
}

export function clearDefaultUser(config: Config): Config {
    if (!config.user) return config
    const { defaultUser: _d, ...restUser } = config.user
    if (Object.keys(restUser).length > 0) return { ...config, user: restUser }
    const { user: _u, ...rest } = config
    return rest
}
