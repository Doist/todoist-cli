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

<<<<<<< HEAD
import {
    CONFIG_VERSION,
    getConfigPath,
    readConfig,
    writeConfig,
    type AuthFlag,
    type AuthMode,
    type Config,
    type StoredUser,
} from './config.js'
=======
import { accountForUser, SERVICE_NAME, TOKEN_ENV_VAR } from './auth-store.js'
import { type AuthFlag, type AuthMode, readConfig, type StoredUser } from './config.js'
>>>>>>> origin/main
import { CliError } from './errors.js'
import { getRequestedUserRef } from './global-args.js'
import { findUserByRef, getStoredUsers, NoUserSelectedError, UserNotFoundError } from './users.js'

export { TOKEN_ENV_VAR } from './auth-store.js'

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
        return { id: 'env', email: '', token: envToken, authMode: 'unknown', source: 'env' }
    }

    const config = await readConfig()
    const users = getStoredUsers(config)
    const ref = opts.ref ?? getRequestedUserRef()

    if (users.length === 0) {
        throw ref ? new UserNotFoundError(ref) : new NoTokenError()
    }

    const target = ref ? (findUserByRef(config, ref)?.user ?? null) : pickDefault(config, users)
    if (!target) {
        // ref miss when records exist, or multi-user no-default.
        throw ref ? new UserNotFoundError(ref) : new NoUserSelectedError()
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

function pickDefault(
    config: { user?: { defaultUser?: string } },
    users: StoredUser[],
): StoredUser | null {
    const defaultId = config.user?.defaultUser
    if (defaultId) {
        const found = users.find((u) => u.id === defaultId)
        if (found) return found
        // Default points at a missing user — fall through to single-user fallback.
    }
    return users.length === 1 ? users[0] : null
}

/** Bearer-only shortcut. Most call sites (SDK, uploads, stats) only need this. */
export async function getApiToken(): Promise<string> {
    return (await resolveActiveUser()).token
}

/**
 * Like `resolveActiveUser` but bundles the rendering metadata `td doctor` /
 * `td config view` want. Lets `SecureStoreUnavailableError` propagate so the
 * diagnostic surfaces can distinguish "missing token" from "broken keyring".
 */
export async function probeApiToken(): Promise<{ token: string; metadata: AuthMetadata }> {
    const resolved = await resolveActiveUser()
    return { token: resolved.token, metadata: resolvedToMetadata(resolved) }
}

export async function getAuthMetadata(): Promise<AuthMetadata> {
    try {
        return resolvedToMetadata(await resolveActiveUser())
    } catch (error) {
        // Permission/scope callers need a sensible default rather than a hard
        // failure when credentials are missing or the keyring is offline.
        if (error instanceof NoTokenError || error instanceof SecureStoreUnavailableError) {
            return { authMode: 'unknown', source: 'secure-store' }
        }
        throw error
    }
}

<<<<<<< HEAD
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
            `Could not persist account record to ${getConfigPath()}${detail}`,
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
        throw new CliError('CONFIG_WRITE_FAILED', `Could not update ${getConfigPath()}${detail}`, [
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

=======
>>>>>>> origin/main
export async function listStoredUsers(): Promise<StoredUser[]> {
    return getStoredUsers(await readConfig())
}

<<<<<<< HEAD
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

export async function loadTokenForStoredUser(
=======
async function loadTokenForStoredUser(
>>>>>>> origin/main
    user: StoredUser,
): Promise<{ token: string; source: 'secure-store' | 'config-file' }> {
    if (user.api_token?.trim()) {
        return { token: user.api_token.trim(), source: 'config-file' }
    }
    // Let `SecureStoreUnavailableError` propagate — a stored v2 user with the
    // keyring offline is not the same situation as no credentials at all.
    const stored = await createSecureStore({
        serviceName: SERVICE_NAME,
        account: accountForUser(user.id),
    }).getSecret()
    if (stored?.trim()) return { token: stored.trim(), source: 'secure-store' }
    throw new NoTokenError()
}

function resolvedToMetadata(resolved: ResolvedUser): AuthMetadata {
    return {
        authMode: resolved.authMode,
        authScope: resolved.authScope,
        authFlags: resolved.authFlags,
        source: resolved.source,
        userId: resolved.id === 'env' ? undefined : resolved.id,
        email: resolved.email || undefined,
    }
}
<<<<<<< HEAD

function buildFallbackWarning(action: string): string {
    return `${SECURE_STORE_DESCRIPTION} unavailable; ${action} ${getConfigPath()}`
}

function buildConfigCleanupWarning(prefix: string, error: unknown): string {
    const detail = error instanceof Error && error.message ? ` (${error.message})` : ''
    return `${prefix} but could not update ${getConfigPath()}${detail}`
}
=======
>>>>>>> origin/main
