import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'

const CONFIG_PATH = join(homedir(), '.config', 'todoist-cli', 'config.json')
const DEFAULT_CACHE_DB_PATH = join(homedir(), '.config', 'todoist-cli', 'cache.db')
const DEFAULT_SYNC_TTL_SECONDS = 60

interface SyncConfig {
    enabled?: boolean
    ttl_seconds?: number
    db_path?: string
}

interface Config {
    api_token?: string
    sync?: SyncConfig
}

export interface SyncSettings {
    enabled: boolean
    ttlSeconds: number
    dbPath: string
}

function resolveHomePath(pathValue: string): string {
    if (pathValue === '~') return homedir()
    if (pathValue.startsWith('~/')) {
        return join(homedir(), pathValue.slice(2))
    }
    return pathValue
}

async function readConfig(): Promise<Config> {
    try {
        const content = await readFile(CONFIG_PATH, 'utf-8')
        return JSON.parse(content) as Config
    } catch {
        return {}
    }
}

async function writeConfig(config: Config): Promise<void> {
    const configDir = dirname(CONFIG_PATH)
    await mkdir(configDir, { recursive: true })
    await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`)
}

export async function getApiToken(): Promise<string> {
    const envToken = process.env.TODOIST_API_TOKEN
    if (envToken) {
        return envToken
    }

    const config = await readConfig()
    if (config.api_token) {
        return config.api_token
    }

    throw new Error(
        'No API token found. Set TODOIST_API_TOKEN environment variable or create ~/.config/todoist-cli/config.json with {"api_token": "your-token"}',
    )
}

export async function saveApiToken(token: string): Promise<void> {
    if (!token || token.trim().length < 10) {
        throw new Error('Invalid token: Token must be at least 10 characters')
    }

    const existingConfig = await readConfig()

    const newConfig: Config = {
        ...existingConfig,
        api_token: token.trim(),
    }

    await writeConfig(newConfig)
}

function parsePositiveInt(value: string | undefined): number | null {
    if (value === undefined) return null
    const parsed = Number.parseInt(value, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) return null
    return parsed
}

export async function getSyncSettings(): Promise<SyncSettings> {
    const config = await readConfig()
    const configSync = config.sync ?? {}

    const configEnabled = configSync.enabled ?? true
    const envDisabled = process.env.TD_SYNC_DISABLE === '1'
    const enabled = !envDisabled && configEnabled

    const envTtl = parsePositiveInt(process.env.TD_SYNC_TTL_SECONDS)
    const configTtl =
        typeof configSync.ttl_seconds === 'number' && configSync.ttl_seconds > 0
            ? configSync.ttl_seconds
            : null
    const ttlSeconds = envTtl ?? configTtl ?? DEFAULT_SYNC_TTL_SECONDS

    const configuredPath =
        process.env.TD_SYNC_DB_PATH ?? configSync.db_path ?? DEFAULT_CACHE_DB_PATH
    const dbPath = resolveHomePath(configuredPath)

    if (!isAbsolute(dbPath)) {
        throw new Error(
            'TD_SYNC_DB_PATH and sync.db_path must be absolute paths (or start with ~/).',
        )
    }

    return {
        enabled,
        ttlSeconds,
        dbPath,
    }
}

export async function clearApiToken(): Promise<void> {
    const config = await readConfig()
    if (Object.keys(config).length === 0) {
        return
    }

    delete config.api_token

    if (Object.keys(config).length === 0) {
        await unlink(CONFIG_PATH)
    } else {
        await writeConfig(config)
    }
}
