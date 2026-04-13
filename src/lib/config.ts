import { chmod, mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const CONFIG_PATH = join(homedir(), '.config', 'todoist-cli', 'config.json')

export type AuthMode = 'read-only' | 'read-write' | 'unknown'
export type UpdateChannel = 'stable' | 'pre-release'
export type AuthFlag = 'read-only' | 'app-management' | 'backups'

export interface Config extends Record<string, unknown> {
    api_token?: string
    pendingSecureStoreClear?: boolean
    auth_mode?: AuthMode
    auth_scope?: string
    auth_flags?: AuthFlag[]
    update_channel?: UpdateChannel
}

const KNOWN_CONFIG_KEYS: ReadonlySet<string> = new Set([
    'api_token',
    'pendingSecureStoreClear',
    'auth_mode',
    'auth_scope',
    'auth_flags',
    'update_channel',
])

const AUTH_MODES: ReadonlySet<AuthMode> = new Set(['read-only', 'read-write', 'unknown'])
export const AUTH_FLAGS: ReadonlySet<AuthFlag> = new Set(['read-only', 'app-management', 'backups'])
const UPDATE_CHANNELS: ReadonlySet<UpdateChannel> = new Set(['stable', 'pre-release'])

export async function readConfig(): Promise<Config> {
    try {
        const content = await readFile(CONFIG_PATH, 'utf-8')
        const parsed = JSON.parse(content)
        return isObject(parsed) ? (parsed as Config) : {}
    } catch {
        return {}
    }
}

export async function writeConfig(config: Config): Promise<void> {
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

    await mkdir(dirname(CONFIG_PATH), { recursive: true, mode: 0o700 })
    await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, {
        encoding: 'utf-8',
        mode: 0o600,
    })
    await chmod(CONFIG_PATH, 0o600)
}

// Keep this validator ad-hoc for now: it is only used by `td doctor`, and the
// config schema is still small enough that adding a runtime validation
// dependency would be heavier than the problem. If more config or payload
// validation use cases show up elsewhere in the CLI, that would strengthen the
// case for introducing zod and consolidating these checks.
export function validateConfigForDoctor(config: Record<string, unknown>): string[] {
    const issues: string[] = []

    for (const key of Object.keys(config)) {
        if (!KNOWN_CONFIG_KEYS.has(key)) {
            issues.push(`contains unrecognized key "${key}"`)
        }
    }

    if (config.api_token !== undefined && typeof config.api_token !== 'string') {
        issues.push('api_token must be a string')
    }

    if (
        config.pendingSecureStoreClear !== undefined &&
        typeof config.pendingSecureStoreClear !== 'boolean'
    ) {
        issues.push('pendingSecureStoreClear must be a boolean')
    }

    if (
        config.auth_mode !== undefined &&
        (typeof config.auth_mode !== 'string' || !AUTH_MODES.has(config.auth_mode as AuthMode))
    ) {
        issues.push('auth_mode must be one of: read-only, read-write, unknown')
    }

    if (config.auth_scope !== undefined && typeof config.auth_scope !== 'string') {
        issues.push('auth_scope must be a string')
    }

    if (config.auth_flags !== undefined) {
        if (
            !Array.isArray(config.auth_flags) ||
            !config.auth_flags.every(
                (flag) => typeof flag === 'string' && AUTH_FLAGS.has(flag as AuthFlag),
            )
        ) {
            issues.push('auth_flags must be an array of: read-only, app-management, backups')
        }
    }

    if (
        config.update_channel !== undefined &&
        (typeof config.update_channel !== 'string' ||
            !UPDATE_CHANNELS.has(config.update_channel as UpdateChannel))
    ) {
        issues.push('update_channel must be one of: stable, pre-release')
    }

    return issues
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMissingFileError(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
