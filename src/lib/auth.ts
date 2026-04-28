import {
    accountForUser,
    createSecureStore,
    LEGACY_ACCOUNT_NAME,
    SECURE_STORE_DESCRIPTION,
    SecureStoreUnavailableError,
} from './secure-store.js'
export {
    AUTH_FLAG_ORDER,
    CONFIG_PATH,
    CONFIG_VERSION,
    readConfig,
    writeConfig,
    type AuthFlag,
    type AuthMode,
    type Config,
    type StoredUser,
    type UpdateChannel,
} from './config.js'

import {
    CONFIG_PATH,
    CONFIG_VERSION,
    readConfig,
    writeConfig,
    type AuthFlag,
    type AuthMode,
    type Config,
    type StoredUser,
} from './config.js'
import { CliError } from './errors.js'
import { getRequestedUserRef } from './global-args.js'
import {
    findUserByRef,
    getDefaultUser,
    getStoredUsers,
    NoUserSelectedError,
    removeStoredUser,
    setDefaultUser as setDefaultUserInConfig,
    upsertStoredUser,
    UserNotFoundError,
} from './users.js'

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

export interface UpsertUserInput {
    id: string
    email: string
    token: string
    authMode?: AuthMode
    authScope?: string
    authFlags?: AuthFlag[]
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

export type TokenStorageLocation = 'secure-store' | 'config-file'

export interface TokenStorageResult {
    storage: TokenStorageLocation
    warning?: string
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
            // Asked for a specific user, but the store is empty — same error
            // as missing user, scoped to the request.
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

/**
 * Add or update a user record. Stores the token in the OS credential manager
 * under `user-<id>` when available, falls back to per-user plaintext in config.
 * Sets `defaultUser` automatically if this is the first user being stored.
 */
export async function upsertUser(
    input: UpsertUserInput,
): Promise<TokenStorageResult & { replaced: boolean }> {
    if (!input.token || input.token.trim().length < 10) {
        throw new CliError('INVALID_TOKEN', 'Invalid token: Token must be at least 10 characters')
    }
    if (!input.id) {
        throw new CliError('INVALID_USER', 'Cannot store user record: missing id')
    }
    if (!input.email) {
        throw new CliError('INVALID_USER', 'Cannot store user record: missing email')
    }

    const trimmedToken = input.token.trim()
    const config = await readConfig()
    const previouslyExisted = getStoredUsers(config).some((u) => u.id === input.id)
    // Always set the first user as the default — even if `config.user.defaultUser`
    // points at a stale/orphaned id, that pointer would otherwise wedge multi-user
    // resolution on subsequent logins.
    const shouldSetDefault = getStoredUsers(config).length === 0

    const baseRecord: StoredUser = {
        id: input.id,
        email: input.email,
        auth_mode: input.authMode,
        auth_scope: input.authScope,
        auth_flags: input.authFlags,
    }

    const secureStore = createSecureStore(accountForUser(input.id))
    let storedSecurely = false
    try {
        await secureStore.setSecret(trimmedToken)
        storedSecurely = true
    } catch (error) {
        if (!(error instanceof SecureStoreUnavailableError)) throw error
    }

    const userRecord: StoredUser = storedSecurely
        ? baseRecord
        : { ...baseRecord, api_token: trimmedToken }

    let next = ensureV2Shape(config)
    next = upsertStoredUser(next, userRecord).config
    if (shouldSetDefault) {
        next = setDefaultUserInConfig(next, input.id)
    }
    next = stripLegacyAuthFields(next)

    try {
        await writeConfig(next)
    } catch (error) {
        // Config write is the source of truth — without it, later commands
        // can't resolve the user even though the keyring holds the secret.
        // Roll the keyring back so we don't leak credentials for a non-stored
        // account, then surface the failure.
        if (storedSecurely) {
            try {
                await secureStore.deleteSecret()
            } catch {
                // best effort — the original error is what the user needs
            }
        }
        const detail = error instanceof Error && error.message ? `: ${error.message}` : ''
        throw new CliError(
            'CONFIG_WRITE_FAILED',
            `Could not persist account record to ${CONFIG_PATH}${detail}`,
            ['Check file permissions on ~/.config/todoist-cli/, then re-run the command'],
        )
    }

    return {
        storage: storedSecurely ? 'secure-store' : 'config-file',
        warning: storedSecurely ? undefined : buildFallbackWarning('token saved as plaintext in'),
        replaced: previouslyExisted,
    }
}

/**
 * Remove the active user (resolved via `--user` or default). For multi-user
 * installs without a default, callers must pass `--user <ref>` to disambiguate.
 */
export async function clearApiToken(opts: { ref?: string } = {}): Promise<TokenStorageResult> {
    const config = await readConfig()
    const users = getStoredUsers(config)
    const requestedRef = opts.ref ?? getRequestedUserRef()

    // No users stored yet — fall through to legacy logout only on a v1-shaped
    // config (no `users` key at all). Empty `users: []` is an already-clean
    // v2 install; treat it as a no-op rather than poking the legacy keyring.
    if (users.length === 0) {
        if (!Array.isArray(config.users)) {
            return clearLegacyToken(config)
        }
        if (requestedRef) {
            throw new UserNotFoundError(requestedRef)
        }
        throw new NoTokenError()
    }

    let target: StoredUser
    if (requestedRef) {
        const found = findUserByRef(config, requestedRef)
        if (!found) throw new UserNotFoundError(requestedRef)
        target = found.user
    } else {
        const def = getDefaultUser(config)
        if (def) {
            target = def
        } else if (users.length === 1) {
            target = users[0]
        } else {
            throw new NoUserSelectedError()
        }
    }

    return removeUserById(target.id)
}

/**
 * Remove a specific user by id. Used by `td user remove` and as the underlying
 * primitive for `clearApiToken`.
 *
 * Order matters: write the new config first (the source of truth) and only
 * then delete the secret. If the config update fails the keyring is untouched,
 * so the user remains fully functional and a retry will simply re-attempt
 * the same operation. A keyring delete failure after a successful config
 * update leaves an orphan secret that the keyring's own service can clean up
 * later — the CLI no longer references it.
 */
export async function removeUserById(id: string): Promise<TokenStorageResult> {
    const config = await readConfig()
    const next = stripLegacyAuthFields(removeStoredUser(ensureV2Shape(config), id))

    try {
        await writeConfig(next)
    } catch (error) {
        const detail = error instanceof Error && error.message ? `: ${error.message}` : ''
        throw new CliError('CONFIG_WRITE_FAILED', `Could not update ${CONFIG_PATH}${detail}`, [
            'Check file permissions on ~/.config/todoist-cli/, then re-run the command',
        ])
    }

    const secureStore = createSecureStore(accountForUser(id))
    try {
        await secureStore.deleteSecret()
    } catch (error) {
        if (!(error instanceof SecureStoreUnavailableError)) throw error
        return {
            storage: 'config-file',
            warning: buildFallbackWarning('local auth state cleared in'),
        }
    }

    return { storage: 'secure-store' }
}

export async function setDefaultUserId(id: string): Promise<void> {
    const config = ensureV2Shape(await readConfig())
    const found = findUserByRef(config, id)
    if (!found) throw new UserNotFoundError(id)
    await writeConfig(stripLegacyAuthFields(setDefaultUserInConfig(config, found.user.id)))
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
    const secureStore = createSecureStore(accountForUser(user.id))
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

    const secureStore = createSecureStore(LEGACY_ACCOUNT_NAME)
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

async function clearLegacyToken(config: Config): Promise<TokenStorageResult> {
    const secureStore = createSecureStore(LEGACY_ACCOUNT_NAME)

    try {
        await secureStore.deleteSecret()
        const cleaned = stripLegacyAuthFields(config)
        try {
            await writeConfig(cleaned)
        } catch (error) {
            return {
                storage: 'secure-store',
                warning: buildConfigCleanupWarning('Secure-store token was removed,', error),
            }
        }
        return { storage: 'secure-store' }
    } catch (error) {
        if (!(error instanceof SecureStoreUnavailableError)) throw error
    }

    const cleared: Config = {
        ...stripLegacyAuthFields(config),
        pendingSecureStoreClear: true,
    }
    try {
        await writeConfig(cleared)
    } catch {
        // best-effort
    }
    return {
        storage: 'config-file',
        warning: buildFallbackWarning('local auth state cleared in'),
    }
}

function ensureV2Shape(config: Config): Config {
    const next: Config = { ...config, config_version: CONFIG_VERSION }
    if (!Array.isArray(next.users)) {
        next.users = []
    }
    return next
}

function stripLegacyAuthFields(config: Config): Config {
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

function buildFallbackWarning(action: string): string {
    return `${SECURE_STORE_DESCRIPTION} unavailable; ${action} ${CONFIG_PATH}`
}

function buildConfigCleanupWarning(prefix: string, error: unknown): string {
    const detail = error instanceof Error && error.message ? ` (${error.message})` : ''
    return `${prefix} but could not update ${CONFIG_PATH}${detail}`
}
