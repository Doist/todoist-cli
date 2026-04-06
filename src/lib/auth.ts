import {
    createSecureStore,
    SecureStoreUnavailableError,
    SECURE_STORE_DESCRIPTION,
} from './secure-store.js'
export {
    CONFIG_PATH,
    readConfig,
    writeConfig,
    type AuthMode,
    type Config,
    type UpdateChannel,
} from './config.js'

import { CONFIG_PATH, readConfig, writeConfig, type AuthMode, type Config } from './config.js'
import { CliError } from './errors.js'

export const TOKEN_ENV_VAR = 'TODOIST_API_TOKEN'

export interface AuthMetadata {
    authMode: AuthMode
    authScope?: string
    source: 'env' | 'secure-store' | 'config-file'
}

export interface SaveApiTokenOptions {
    authMode?: AuthMode
    authScope?: string
}

export interface AuthProbeResult {
    token: string
    metadata: AuthMetadata
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

export async function getApiToken(): Promise<string> {
    // Priority 1: Environment variable
    const envToken = process.env[TOKEN_ENV_VAR]
    if (envToken) {
        return envToken
    }

    const config = await readConfig()
    const configToken = getConfigToken(config)
    const secureStore = createSecureStore()

    if (configToken) {
        try {
            await secureStore.setSecret(configToken)
            const cleanupWarning = await cleanupAuthFallbackState(
                config,
                'Token was migrated to secure storage,',
            )
            if (cleanupWarning) {
                warn(cleanupWarning)
            }
        } catch (error) {
            if (!(error instanceof SecureStoreUnavailableError)) {
                throw error
            }
        }

        return configToken
    }

    if (config.pendingSecureStoreClear) {
        try {
            await secureStore.deleteSecret()
            const cleanupWarning = await cleanupAuthFallbackState(
                config,
                'Secure-store token was removed,',
            )
            if (cleanupWarning) {
                warn(cleanupWarning)
            }
        } catch (error) {
            if (!(error instanceof SecureStoreUnavailableError)) {
                throw error
            }
        }

        throw new NoTokenError()
    }

    try {
        const storedToken = await secureStore.getSecret()
        if (storedToken?.trim()) {
            return storedToken
        }
    } catch (error) {
        if (!(error instanceof SecureStoreUnavailableError)) {
            throw error
        }
    }

    throw new NoTokenError()
}

export async function probeApiToken(): Promise<AuthProbeResult> {
    const envToken = process.env[TOKEN_ENV_VAR]
    if (envToken) {
        return {
            token: envToken,
            metadata: { authMode: 'unknown', source: 'env' },
        }
    }

    const config = await readConfig()
    const configToken = getConfigToken(config)

    if (configToken) {
        return {
            token: configToken,
            metadata: {
                authMode: config.auth_mode ?? 'unknown',
                authScope: config.auth_scope,
                source: 'config-file',
            },
        }
    }

    if (config.pendingSecureStoreClear) {
        throw new NoTokenError()
    }

    const secureStore = createSecureStore()
    try {
        const storedToken = await secureStore.getSecret()
        if (storedToken?.trim()) {
            return {
                token: storedToken.trim(),
                metadata: {
                    authMode: config.auth_mode ?? 'unknown',
                    authScope: config.auth_scope,
                    source: 'secure-store',
                },
            }
        }
    } catch (error) {
        if (!(error instanceof SecureStoreUnavailableError)) {
            throw error
        }
        throw error
    }

    throw new NoTokenError()
}

export async function saveApiToken(
    token: string,
    options: SaveApiTokenOptions = {},
): Promise<TokenStorageResult> {
    // Validate token (non-empty, reasonable length)
    if (!token || token.trim().length < 10) {
        throw new CliError('INVALID_TOKEN', 'Invalid token: Token must be at least 10 characters')
    }

    const trimmedToken = token.trim()
    const secureStore = createSecureStore()

    try {
        await secureStore.setSecret(trimmedToken)
        const existingConfig = await readConfig()
        const configWithMeta = withAuthMetadata(existingConfig, options)
        const warning = await cleanupAuthFallbackState(configWithMeta, 'Token was stored securely,')
        return warning ? { storage: 'secure-store', warning } : { storage: 'secure-store' }
    } catch (error) {
        if (!(error instanceof SecureStoreUnavailableError)) {
            throw error
        }
    }

    const config = await readConfig()
    config.api_token = trimmedToken
    delete config.pendingSecureStoreClear
    config.auth_mode = options.authMode
    config.auth_scope = options.authScope
    await writeConfig(config)
    return {
        storage: 'config-file',
        warning: buildFallbackWarning('token saved as plaintext in'),
    }
}

export async function clearApiToken(): Promise<TokenStorageResult> {
    const config = await readConfig()
    const secureStore = createSecureStore()

    try {
        await secureStore.deleteSecret()
        const warning = await cleanupAllAuthState(config, 'Secure-store token was removed,')
        return warning ? { storage: 'secure-store', warning } : { storage: 'secure-store' }
    } catch (error) {
        if (!(error instanceof SecureStoreUnavailableError)) {
            throw error
        }
    }

    await writeConfig(withPendingSecureStoreClear(withoutAuthMetadata(config)))
    return {
        storage: 'config-file',
        warning: buildFallbackWarning('local auth state cleared in'),
    }
}

export async function getAuthMetadata(): Promise<AuthMetadata> {
    if (process.env[TOKEN_ENV_VAR]) {
        return { authMode: 'unknown', source: 'env' }
    }

    const config = await readConfig()

    if (config.auth_mode) {
        return {
            authMode: config.auth_mode,
            authScope: config.auth_scope,
            source: getConfigToken(config) ? 'config-file' : 'secure-store',
        }
    }

    return {
        authMode: 'unknown',
        source: getConfigToken(config) ? 'config-file' : 'secure-store',
    }
}

async function cleanupAuthFallbackState(
    config: Config,
    warningPrefix: string,
): Promise<string | undefined> {
    try {
        await writeConfig(withoutAuthFallbackState(config))
        return undefined
    } catch (error) {
        return buildConfigCleanupWarning(warningPrefix, error)
    }
}

function getConfigToken(config: Config): string | null {
    return typeof config.api_token === 'string' && config.api_token.trim()
        ? config.api_token.trim()
        : null
}

function withoutAuthFallbackState(config: Config): Config {
    const { api_token: _token, pendingSecureStoreClear: _pending, ...rest } = config
    return rest
}

function withPendingSecureStoreClear(config: Config): Config {
    return { ...withoutAuthFallbackState(config), pendingSecureStoreClear: true }
}

function withAuthMetadata(config: Config, options: SaveApiTokenOptions): Config {
    return {
        ...config,
        auth_mode: options.authMode,
        auth_scope: options.authScope,
    }
}

function withoutAuthMetadata(config: Config): Config {
    const { auth_mode: _mode, auth_scope: _scope, ...rest } = config
    return rest
}

async function cleanupAllAuthState(
    config: Config,
    warningPrefix: string,
): Promise<string | undefined> {
    try {
        await writeConfig(withoutAuthFallbackState(withoutAuthMetadata(config)))
        return undefined
    } catch (error) {
        return buildConfigCleanupWarning(warningPrefix, error)
    }
}

function buildFallbackWarning(action: string): string {
    return `${SECURE_STORE_DESCRIPTION} unavailable; ${action} ${CONFIG_PATH}`
}

function buildConfigCleanupWarning(prefix: string, error: unknown): string {
    const detail = error instanceof Error && error.message ? ` (${error.message})` : ''
    return `${prefix} but could not remove legacy plaintext token from ${CONFIG_PATH}${detail}`
}

function warn(message: string): void {
    console.error(`Warning: ${message}`)
}
