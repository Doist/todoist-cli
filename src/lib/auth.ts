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

import { accountForUser, SERVICE_NAME, TOKEN_ENV_VAR } from './auth-store.js'
import { type AuthFlag, type AuthMode, readConfig, type StoredUser } from './config.js'
import { CliError } from './errors.js'
import { getRequestedUserRef } from './global-args.js'
import {
    findUserByRef,
    getEffectiveDefaultUser,
    getStoredUsers,
    NoUserSelectedError,
    UserNotFoundError,
} from './users.js'

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

    const target = ref
        ? (findUserByRef(config, ref)?.user ?? null)
        : (getEffectiveDefaultUser(config) ?? null)
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

export async function listStoredUsers(): Promise<StoredUser[]> {
    return getStoredUsers(await readConfig())
}

async function loadTokenForStoredUser(
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
