import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import {
    createSecureStore,
    SecureStoreUnavailableError,
    SECURE_STORE_DESCRIPTION,
} from './secure-store.js'

export const CONFIG_PATH = join(homedir(), '.config', 'todoist-cli', 'config.json')
export const TOKEN_ENV_VAR = 'TODOIST_API_TOKEN'
export const NO_TOKEN_ERROR = `No API token found. Set ${TOKEN_ENV_VAR} or run \`td auth login\` or \`td auth token <token>\`.`

export type TokenStorageLocation = 'secure-store' | 'config-file'

export interface TokenStorageResult {
    storage: TokenStorageLocation
    warning?: string
}

interface Config extends Record<string, unknown> {
    api_token?: string
    pendingSecureStoreClear?: boolean
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
            if (error instanceof SecureStoreUnavailableError) {
                warnSecureStoreFallback('using plaintext token from')
            } else {
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

        throw new Error(NO_TOKEN_ERROR)
    }

    try {
        const storedToken = await secureStore.getSecret()
        if (storedToken?.trim()) {
            return storedToken
        }
    } catch (error) {
        if (error instanceof SecureStoreUnavailableError) {
            warnSecureStoreFallback('using plaintext token from')
        } else {
            throw error
        }
    }

    throw new Error(
        `No API token found. Set ${TOKEN_ENV_VAR} or run \`td auth login\` or \`td auth token <token>\`.`,
    )
}

export async function saveApiToken(token: string): Promise<TokenStorageResult> {
    // Validate token (non-empty, reasonable length)
    if (!token || token.trim().length < 10) {
        throw new Error('Invalid token: Token must be at least 10 characters')
    }

    const trimmedToken = token.trim()
    const secureStore = createSecureStore()

    try {
        await secureStore.setSecret(trimmedToken)
        const existingConfig = await readConfig()
        const warning = await cleanupAuthFallbackState(existingConfig, 'Token was stored securely,')
        return warning ? { storage: 'secure-store', warning } : { storage: 'secure-store' }
    } catch (error) {
        if (!(error instanceof SecureStoreUnavailableError)) {
            throw error
        }
    }

    const config = await readConfig()
    config.api_token = trimmedToken
    delete config.pendingSecureStoreClear
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
        const warning = await cleanupAuthFallbackState(config, 'Secure-store token was removed,')
        return warning ? { storage: 'secure-store', warning } : { storage: 'secure-store' }
    } catch (error) {
        if (!(error instanceof SecureStoreUnavailableError)) {
            throw error
        }
    }

    await writeConfig(withPendingSecureStoreClear(config))
    return {
        storage: 'config-file',
        warning: buildFallbackWarning('local auth state cleared in'),
    }
}

async function readConfig(): Promise<Config> {
    try {
        const content = await readFile(CONFIG_PATH, 'utf-8')
        const parsed = JSON.parse(content)
        return isObject(parsed) ? (parsed as Config) : {}
    } catch {
        return {}
    }
}

async function writeConfig(config: Config): Promise<void> {
    if (Object.keys(config).length === 0) {
        try {
            await unlink(CONFIG_PATH)
        } catch (error) {
            if (!isMissingFileError(error)) {
                throw error
            }
        }
        return
    }

    await mkdir(dirname(CONFIG_PATH), { recursive: true })
    await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`)
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

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMissingFileError(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT'
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

function warnSecureStoreFallback(action: string): void {
    warn(buildFallbackWarning(action))
}
