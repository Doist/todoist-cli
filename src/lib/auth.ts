import { createSecureStore, SecureStoreUnavailableError } from '@doist/cli-core/auth'
export type { TokenStorageLocation, TokenStorageResult } from '@doist/cli-core/auth'
export {
    AUTH_FLAG_ORDER,
    CONFIG_VERSION,
    getConfigPath,
    readConfig,
    writeConfig,
    type AuthFlag,
    type AuthMode,
    type Config,
    type StoredUser,
    type UpdateChannel,
} from './config.js'

import { accountForUser, LEGACY_ACCOUNT, SERVICE_NAME } from './auth-store.js'
import {
    type AuthFlag,
    type AuthMode,
    type Config,
    getConfigPath,
    readConfig,
    type StoredUser,
    stripLegacyAuthFields,
    writeConfig,
} from './config.js'
import { CliError } from './errors.js'
import { getRequestedUserRef } from './global-args.js'
import { findUserByRef, getStoredUsers, NoUserSelectedError, UserNotFoundError } from './users.js'

export const TOKEN_ENV_VAR = 'TODOIST_API_TOKEN'

export interface AuthMetadata {
    authMode: AuthMode
    authScope?: string
    authFlags?: AuthFlag[]
    source: 'env' | 'secure-store' | 'config-file'
    userId?: string
    email?: string
}

export interface ResolvedUser {
    id: string
    email: string
    token: string
    authMode: AuthMode
    authScope?: string
    authFlags?: AuthFlag[]
    source: AuthMetadata['source']
}

export class NoTokenError extends CliError {
    constructor() {
        super(
            'NO_TOKEN',
            `No API token found. Set ${TOKEN_ENV_VAR} or run \`td auth login\` or \`td auth token <token>\`.`,
            ['Set TODOIST_API_TOKEN or run: td auth login'],
            'info',
        )
        this.name = 'NoTokenError'
    }
}

// ---------------------------------------------------------------------------
// Public API — used by api/core, uploads, stats, doctor, auth subcommands
// ---------------------------------------------------------------------------

/**
 * Resolve which stored user this invocation should act as, and load their
 * token. Honors `--user <ref>`, then `user.defaultUser`, then a single stored
 * user. Throws `NoUserSelectedError` when multiple users are stored without a
 * default and no `--user` was passed; `UserNotFoundError` when `--user` does
 * not match; `NoTokenError` when no users are stored.
 *
 * `TODOIST_API_TOKEN` short-circuits the resolver entirely — env tokens act as
 * an anonymous identity for the duration of the command.
 */
export async function resolveActiveUser(opts: { ref?: string } = {}): Promise<ResolvedUser> {
    const envToken = process.env[TOKEN_ENV_VAR]
    if (envToken) {
        return {
            id: 'env',
            email: '',
            token: envToken,
            authMode: 'unknown',
            source: 'env',
        }
    }

    const config = await readConfig()
    const users = getStoredUsers(config)
    const requestedRef = opts.ref ?? getRequestedUserRef()

    // Gate the legacy fallback on the *absence* of `config.users` rather than
    // an empty array. A v2 config that has been logged out (`users: []`) must
    // not silently fall back to a stale `api-token` keyring entry — that
    // would let a forgotten v1 credential reauthenticate the next command.
    const isLegacyShape = !Array.isArray(config.users)
    if (users.length === 0) {
        if (requestedRef) {
            throw new UserNotFoundError(requestedRef)
        }
        if (isLegacyShape) {
            return resolveLegacyToken(config)
        }
        throw new NoTokenError()
    }

    let target: StoredUser
    if (requestedRef) {
        const found = findUserByRef(config, requestedRef)
        if (!found) throw new UserNotFoundError(requestedRef)
        target = found.user
    } else if (config.user?.defaultUser) {
        const found = findUserByRef(config, config.user.defaultUser)
        if (!found) {
            // Default points at a missing user — treat like no default.
            if (users.length === 1) {
                target = users[0]
            } else {
                throw new NoUserSelectedError()
            }
        } else {
            target = found.user
        }
    } else if (users.length === 1) {
        target = users[0]
    } else {
        throw new NoUserSelectedError()
    }

    const { token, source } = await loadTokenForStoredUser(target)
    return {
        id: target.id,
        email: target.email,
        token,
        authMode: target.auth_mode ?? 'unknown',
        authScope: target.auth_scope,
        authFlags: target.auth_flags,
        source,
    }
}

/**
 * Backwards-compatible no-arg accessor for the active user's token. Most call
 * sites (uploads, stats, api/core) only need the bearer string.
 */
export async function getApiToken(): Promise<string> {
    const resolved = await resolveActiveUser()
    return resolved.token
}

/**
 * Like `resolveActiveUser` but returns whichever credentials are at hand
 * without mutating storage. Useful for `td doctor` / `td config view` where
 * we want to inspect (and report on) what would be used.
 */
export async function probeApiToken(): Promise<{ token: string; metadata: AuthMetadata }> {
    const resolved = await resolveActiveUser()
    return {
        token: resolved.token,
        metadata: resolvedToMetadata(resolved),
    }
}

export async function getAuthMetadata(): Promise<AuthMetadata> {
    try {
        const resolved = await resolveActiveUser()
        return resolvedToMetadata(resolved)
    } catch (error) {
        // Metadata callers (e.g. `ensureWriteAllowed`, scope-error
        // remediation) need a sensible default rather than a hard failure
        // when credentials are missing or the keyring is offline. Diagnostic
        // commands use `probeApiToken` for that — it intentionally lets
        // `SecureStoreUnavailableError` propagate so it can be reported.
        if (error instanceof NoTokenError || error instanceof SecureStoreUnavailableError) {
            return { authMode: 'unknown', source: 'secure-store' }
        }
        throw error
    }
}

export async function listStoredUsers(): Promise<StoredUser[]> {
    const config = await readConfig()
    return getStoredUsers(config)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function loadTokenForStoredUser(
    user: StoredUser,
): Promise<{ token: string; source: 'secure-store' | 'config-file' }> {
    if (user.api_token?.trim()) {
        return { token: user.api_token.trim(), source: 'config-file' }
    }
    const secureStore = createSecureStore({
        serviceName: SERVICE_NAME,
        account: accountForUser(user.id),
    })
    // Re-throw `SecureStoreUnavailableError` rather than collapsing it into
    // `NoTokenError`. A stored v2 user with the keyring offline is *not* the
    // same situation as no credentials at all — `td doctor` and `td config
    // view` both have dedicated handling for the unavailable-store case and
    // should report the keyring failure rather than misleadingly say the user
    // has no saved credentials.
    const stored = await secureStore.getSecret()
    if (stored?.trim()) {
        return { token: stored.trim(), source: 'secure-store' }
    }
    throw new NoTokenError()
}

/**
 * v1 fallback: when there are no v2 users in the config, see if a legacy
 * single-user token is present (config plaintext or legacy `api-token`
 * keyring entry). Returns it as a synthetic ResolvedUser so the CLI keeps
 * working until postinstall (or `td auth login`) migrates the install.
 */
async function resolveLegacyToken(config: Config): Promise<ResolvedUser> {
    const legacyToken = typeof config.api_token === 'string' ? config.api_token.trim() : ''
    if (legacyToken) {
        return {
            id: 'legacy',
            email: '',
            token: legacyToken,
            authMode: config.auth_mode ?? 'unknown',
            authScope: config.auth_scope,
            authFlags: config.auth_flags,
            source: 'config-file',
        }
    }

    if (config.pendingSecureStoreClear) {
        // v1 logout state: nothing to restore. Surface as the same NoTokenError
        // the v1 path used to throw.
        throw new NoTokenError()
    }

    const secureStore = createSecureStore({ serviceName: SERVICE_NAME, account: LEGACY_ACCOUNT })
    try {
        const stored = await secureStore.getSecret()
        if (stored?.trim()) {
            return {
                id: 'legacy',
                email: '',
                token: stored.trim(),
                authMode: config.auth_mode ?? 'unknown',
                authScope: config.auth_scope,
                authFlags: config.auth_flags,
                source: 'secure-store',
            }
        }
    } catch (error) {
        if (!(error instanceof SecureStoreUnavailableError)) throw error
    }

    throw new NoTokenError()
}

/**
 * v1 logout: clean up legacy state when a `td auth logout` lands on a v1
 * install that postinstall migration hasn't touched yet (offline first run,
 * etc.). Pairs with the `resolveLegacyToken` read path above; remove together
 * once that fallback is dropped.
 *
 * Returns the storage location that was cleared (mirrors `TokenStorageResult`)
 * or `null` if nothing legacy was present.
 */
export async function clearLegacyToken(): Promise<{
    storage: 'secure-store' | 'config-file'
    warning?: string
} | null> {
    const config = await readConfig()
    const hadLegacyConfig = typeof config.api_token === 'string' && config.api_token.length > 0
    const secureStore = createSecureStore({ serviceName: SERVICE_NAME, account: LEGACY_ACCOUNT })

    let secureStoreCleared = false
    let keyringUnavailable = false
    try {
        secureStoreCleared = await secureStore.deleteSecret()
    } catch (error) {
        if (!(error instanceof SecureStoreUnavailableError)) throw error
        keyringUnavailable = true
    }

    if (!hadLegacyConfig && !secureStoreCleared && !keyringUnavailable) {
        return null
    }

    // Persist v2 shape so subsequent runs don't keep entering the legacy path.
    // Drop `api_token` / `auth_mode` / etc. and stamp `pendingSecureStoreClear`
    // only when the keyring couldn't be reached, mirroring the prior contract
    // the resolver checks via `resolveLegacyToken`.
    const stripped = stripLegacyAuthFields(config)
    const next: Config = keyringUnavailable
        ? { ...stripped, pendingSecureStoreClear: true }
        : stripped
    try {
        await writeConfig(next)
    } catch {
        // Best-effort — the keyring delete already happened (or failed
        // visibly); a config-write failure on logout is not worth surfacing.
    }

    if (keyringUnavailable) {
        return {
            storage: 'config-file',
            warning: `system credential manager unavailable; local auth state cleared in ${getConfigPath()}`,
        }
    }
    return { storage: 'secure-store' }
}

function resolvedToMetadata(resolved: ResolvedUser): AuthMetadata {
    return {
        authMode: resolved.authMode,
        authScope: resolved.authScope,
        authFlags: resolved.authFlags,
        source: resolved.source,
        userId: resolved.id === 'env' || resolved.id === 'legacy' ? undefined : resolved.id,
        email: resolved.email || undefined,
    }
}
