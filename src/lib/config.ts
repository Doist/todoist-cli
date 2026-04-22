import { chmod, mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { CliError } from './errors.js'
import { normalizeHelpCenterLocale } from './help-center.js'

export const CONFIG_PATH = join(homedir(), '.config', 'todoist-cli', 'config.json')

export type AuthMode = 'read-only' | 'read-write' | 'unknown'
export type UpdateChannel = 'stable' | 'pre-release'

export interface HelpCenterConfig {
    defaultLocale?: string
}

/**
 * Canonical ordered list of login flags. Acts as the single source of truth —
 * `AuthFlag`, `AUTH_FLAGS` (validation), and the display order of re-login
 * suggestions in `buildReloginCommand` all derive from this one list. Adding
 * a new flag only requires appending it here and wiring it into the login
 * command; everything downstream stays consistent.
 */
export const AUTH_FLAG_ORDER = ['read-only', 'app-management', 'backups'] as const
export type AuthFlag = (typeof AUTH_FLAG_ORDER)[number]

export interface Config extends Record<string, unknown> {
    api_token?: string
    pendingSecureStoreClear?: boolean
    auth_mode?: AuthMode
    auth_scope?: string
    auth_flags?: AuthFlag[]
    update_channel?: UpdateChannel
    hc?: HelpCenterConfig
}

const KNOWN_CONFIG_KEYS: ReadonlySet<string> = new Set([
    'api_token',
    'pendingSecureStoreClear',
    'auth_mode',
    'auth_scope',
    'auth_flags',
    'update_channel',
    'hc',
])

const KNOWN_HC_CONFIG_KEYS: ReadonlySet<string> = new Set(['defaultLocale'])

const AUTH_MODES: ReadonlySet<AuthMode> = new Set(['read-only', 'read-write', 'unknown'])
export const AUTH_FLAGS: ReadonlySet<AuthFlag> = new Set(AUTH_FLAG_ORDER)
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

export type StrictReadResult = { state: 'missing' } | { state: 'present'; config: Config }

/**
 * Read and parse the config file strictly — for inspection commands that need
 * to distinguish "missing" from "present but broken". `readConfig` deliberately
 * swallows errors for runtime code paths; this one surfaces them.
 */
export async function readConfigStrict(): Promise<StrictReadResult> {
    let content: string
    try {
        content = await readFile(CONFIG_PATH, 'utf-8')
    } catch (error) {
        if (isMissingFileError(error)) return { state: 'missing' }
        const detail = error instanceof Error ? error.message : String(error)
        throw new CliError(
            'CONFIG_READ_FAILED',
            `Could not read config file ${CONFIG_PATH}: ${detail}`,
            ['Check file permissions, or run `td doctor` to diagnose'],
        )
    }

    let parsed: unknown
    try {
        parsed = JSON.parse(content)
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        throw new CliError(
            'CONFIG_INVALID_JSON',
            `Config file at ${CONFIG_PATH} is not valid JSON: ${detail}`,
            ['Fix the JSON by hand, or delete the file and re-authenticate with `td auth login`'],
        )
    }

    if (!isObject(parsed)) {
        const actual = Array.isArray(parsed) ? 'array' : typeof parsed
        throw new CliError(
            'CONFIG_INVALID_SHAPE',
            `Config file at ${CONFIG_PATH} must contain a JSON object (got ${actual})`,
            ['Fix the JSON by hand, or delete the file and re-authenticate with `td auth login`'],
        )
    }

    return { state: 'present', config: parsed as Config }
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
            issues.push(`auth_flags must be an array of: ${AUTH_FLAG_ORDER.join(', ')}`)
        }
    }

    if (
        config.update_channel !== undefined &&
        (typeof config.update_channel !== 'string' ||
            !UPDATE_CHANNELS.has(config.update_channel as UpdateChannel))
    ) {
        issues.push('update_channel must be one of: stable, pre-release')
    }

    if (config.hc !== undefined) {
        if (!isObject(config.hc)) {
            issues.push('hc must be an object')
        } else {
            for (const key of Object.keys(config.hc)) {
                if (!KNOWN_HC_CONFIG_KEYS.has(key)) {
                    issues.push(`hc contains unrecognized key "${key}"`)
                }
            }
            const defaultLocale = (config.hc as Record<string, unknown>).defaultLocale
            if (defaultLocale !== undefined) {
                if (typeof defaultLocale !== 'string') {
                    issues.push('hc.defaultLocale must be a string')
                } else {
                    try {
                        normalizeHelpCenterLocale(defaultLocale)
                    } catch {
                        issues.push(
                            'hc.defaultLocale must be a Help Center locale like "en-us", "es", or "pt-br"',
                        )
                    }
                }
            }
        }
    }

    return issues
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMissingFileError(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
