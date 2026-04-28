import type { Config, StoredUser } from './config.js'
import { CliError } from './errors.js'

/**
 * Reference shape accepted by `--user` and `td user` subcommands: an exact
 * Todoist user id, or a Todoist account email (case-insensitive).
 */
export type UserRef = string

export interface FindUserResult {
    user: StoredUser
    index: number
}

export class UserNotFoundError extends CliError {
    constructor(ref: UserRef) {
        super(
            'USER_NOT_FOUND',
            `No stored user matches "${ref}". Use \`td user list\` to see authenticated accounts.`,
            ['Run `td auth login` to add an account, or `td user list` to inspect existing ones'],
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
                'Set a default with `td user use <id|email>`',
            ],
            'info',
        )
        this.name = 'NoUserSelectedError'
    }
}

export function getStoredUsers(config: Config): StoredUser[] {
    return Array.isArray(config.users) ? config.users : []
}

export function findUserByRef(config: Config, ref: UserRef): FindUserResult | null {
    const users = getStoredUsers(config)
    const trimmed = ref.trim()
    if (!trimmed) return null

    // Exact id match first (ids are numeric strings; case-sensitive)
    const byId = users.findIndex((u) => u.id === trimmed)
    if (byId !== -1) return { user: users[byId], index: byId }

    // Email match — case-insensitive
    const lower = trimmed.toLowerCase()
    const byEmail = users.findIndex((u) => u.email.toLowerCase() === lower)
    if (byEmail !== -1) return { user: users[byEmail], index: byEmail }

    return null
}

export function requireUserByRef(config: Config, ref: UserRef): FindUserResult {
    const found = findUserByRef(config, ref)
    if (!found) throw new UserNotFoundError(ref)
    return found
}

export function getDefaultUserId(config: Config): string | undefined {
    return config.user?.defaultUser
}

export function getDefaultUser(config: Config): StoredUser | null {
    const id = getDefaultUserId(config)
    if (!id) return null
    return getStoredUsers(config).find((u) => u.id === id) ?? null
}

/**
 * Replace or append a user record. Returns a new config and whether the user
 * was already present (so callers can show "replaced" vs "added" messages).
 */
export function upsertStoredUser(
    config: Config,
    next: StoredUser,
): { config: Config; replaced: boolean } {
    const users = getStoredUsers(config).slice()
    const idx = users.findIndex((u) => u.id === next.id)
    const replaced = idx !== -1
    if (replaced) {
        users[idx] = next
    } else {
        users.push(next)
    }
    return { config: { ...config, users }, replaced }
}

export function removeStoredUser(config: Config, id: string): Config {
    const users = getStoredUsers(config).filter((u) => u.id !== id)
    const next: Config = { ...config, users }
    if (next.user?.defaultUser === id) {
        const { defaultUser: _, ...restUser } = next.user
        next.user = Object.keys(restUser).length === 0 ? undefined : restUser
        if (next.user === undefined) {
            const { user: _u, ...rest } = next
            return rest
        }
    }
    return next
}

export function setDefaultUser(config: Config, id: string): Config {
    return { ...config, user: { ...config.user, defaultUser: id } }
}
