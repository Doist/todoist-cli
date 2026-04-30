/**
 * One-time migration of v1 single-user auth state into the v2 multi-user
 * shape. Invoked from `src/postinstall.ts` so existing installs upgrade
 * transparently. Best-effort: any failure (offline, invalid token, keyring
 * unavailable) leaves the v1 state untouched so the runtime fallback in
 * `resolveActiveUser` can keep serving the legacy token until the next
 * upgrade attempt or `td auth login`.
 */

import { type Config, CONFIG_VERSION, readConfig, type StoredUser, writeConfig } from './config.js'
import {
    accountForUser,
    createSecureStore,
    LEGACY_ACCOUNT_NAME,
    SecureStoreUnavailableError,
} from './secure-store.js'
import { fetchTodoist } from './usage-tracking.js'

export interface MigrateAuthResult {
    status: 'already-migrated' | 'no-legacy-state' | 'migrated' | 'skipped'
    reason?: string
    migratedUserId?: string
    migratedEmail?: string
}

interface MigrateOptions {
    /** Suppress console output. Postinstall sets this; CLI surfaces use it via warn(). */
    silent?: boolean
    /** Override fetch (for tests). */
    fetchImpl?: typeof fetch
}

interface TodoistUser {
    id: string
    email: string
}

const USER_ENDPOINT = 'https://api.todoist.com/api/v1/user'

export async function migrateLegacyAuth(opts: MigrateOptions = {}): Promise<MigrateAuthResult> {
    const fetchImpl = opts.fetchImpl ?? fetch
    const config = await readConfig()

    // Already on v2 — the presence of `users` is the marker. Empty array still
    // counts as migrated (clean slate after a logout).
    if (Array.isArray(config.users)) {
        return { status: 'already-migrated' }
    }

    const legacyToken = await loadLegacyToken(config)
    if (!legacyToken) {
        // No usable token to migrate. Still write the v2 marker so the runtime
        // resolver doesn't keep looking for one — but only if there's nothing
        // there at all (untouched config file).
        if (
            config.api_token === undefined &&
            config.auth_mode === undefined &&
            config.auth_scope === undefined &&
            config.auth_flags === undefined &&
            !config.pendingSecureStoreClear
        ) {
            return { status: 'no-legacy-state' }
        }

        // Legacy state exists (e.g., pendingSecureStoreClear) but no token.
        // Clean up to v2 shape.
        try {
            await writeConfig(toV2(stripLegacy(config), []))
        } catch (error) {
            return skipped(opts, `failed to clean up legacy config (${describe(error)})`)
        }
        return { status: 'migrated' }
    }

    // Identify the user behind the legacy token via a one-shot REST call —
    // no SDK import to keep postinstall lightweight.
    let user: TodoistUser
    try {
        user = await fetchUser(legacyToken, fetchImpl)
    } catch (error) {
        return skipped(opts, `could not identify Todoist user (${describe(error)})`)
    }

    const record: StoredUser = {
        id: user.id,
        email: user.email,
        auth_mode: config.auth_mode,
        auth_scope: config.auth_scope,
        auth_flags: config.auth_flags,
    }

    // Move the token into the per-user keyring slot.
    let storedSecurely = false
    try {
        const userStore = createSecureStore(accountForUser(user.id))
        await userStore.setSecret(legacyToken)
        storedSecurely = true
    } catch (error) {
        if (!(error instanceof SecureStoreUnavailableError)) {
            return skipped(opts, `failed to write user-scoped credential (${describe(error)})`)
        }
    }

    if (!storedSecurely) {
        record.api_token = legacyToken
    }

    const next = toV2(stripLegacy(config), [record], user.id)

    try {
        await writeConfig(next)
    } catch (error) {
        return skipped(opts, `failed to update config (${describe(error)})`)
    }

    // Clean up the legacy keyring entry — best effort, never fatal.
    try {
        const legacyStore = createSecureStore(LEGACY_ACCOUNT_NAME)
        await legacyStore.deleteSecret()
    } catch {
        // ignore
    }

    if (!opts.silent) {
        console.error(`todoist-cli: migrated existing token to multi-user store (${user.email}).`)
    }

    return { status: 'migrated', migratedUserId: user.id, migratedEmail: user.email }
}

async function loadLegacyToken(config: Config): Promise<string | null> {
    if (typeof config.api_token === 'string' && config.api_token.trim()) {
        return config.api_token.trim()
    }
    try {
        const legacyStore = createSecureStore(LEGACY_ACCOUNT_NAME)
        const stored = await legacyStore.getSecret()
        if (stored?.trim()) return stored.trim()
    } catch (error) {
        if (!(error instanceof SecureStoreUnavailableError)) throw error
    }
    return null
}

async function fetchUser(token: string, fetchImpl: typeof fetch): Promise<TodoistUser> {
    const response = await fetchTodoist(
        USER_ENDPOINT,
        {
            headers: { Authorization: `Bearer ${token}` },
        },
        fetchImpl,
        'postinstall:auth-migrate',
    )
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`)
    }
    const data = (await response.json()) as { id?: unknown; email?: unknown }
    if (typeof data.id !== 'string' || !data.id) {
        throw new Error('response missing user id')
    }
    if (typeof data.email !== 'string' || !data.email) {
        throw new Error('response missing user email')
    }
    return { id: data.id, email: data.email }
}

function toV2(config: Config, users: StoredUser[], defaultUserId?: string): Config {
    const next: Config = { ...config, config_version: CONFIG_VERSION, users }
    if (defaultUserId) {
        next.user = { ...next.user, defaultUser: defaultUserId }
    }
    return next
}

function stripLegacy(config: Config): Config {
    const {
        api_token: _t,
        auth_mode: _m,
        auth_scope: _s,
        auth_flags: _f,
        pendingSecureStoreClear: _p,
        ...rest
    } = config
    return rest
}

function describe(error: unknown): string {
    return error instanceof Error && error.message ? error.message : String(error)
}

function skipped(opts: MigrateOptions, reason: string): MigrateAuthResult {
    if (!opts.silent) {
        console.error(`todoist-cli: skipped legacy auth migration — ${reason}.`)
    }
    return { status: 'skipped', reason }
}
