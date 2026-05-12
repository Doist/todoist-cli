import {
    getConfigPath as getConfigPathCore,
    readConfig as readConfigCore,
    readConfigStrict as readConfigStrictCore,
    writeConfig as writeConfigCore,
} from '@doist/cli-core'
import { CliError } from './errors.js'
import { normalizeHelpCenterLocale } from './help-center.js'

const APP_NAME = 'todoist-cli'

/**
 * Resolve the canonical config path lazily. Computing on each call (instead of
 * caching at module load) keeps the path responsive to vitest's `vi.doMock`
 * for `node:os` — which only reliably reaches cli-core's compiled `homedir()`
 * call after the mock has been set up by the test, not at import time.
 */
export function getConfigPath(): string {
    return getConfigPathCore(APP_NAME)
}

export type AuthMode = 'read-only' | 'read-write' | 'unknown'
export type UpdateChannel = 'stable' | 'pre-release'

export interface HelpCenterConfig {
    defaultLocale?: string
}

export interface WorkspaceConfig {
    defaultWorkspace?: string
}

export interface UserConfig {
    defaultUser?: string
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

/**
 * Per-user record stored in `config.users`. The token itself lives in the OS
 * credential manager under account `user-<id>`; `api_token` only appears here
 * when the credential manager was unavailable at save time (plaintext fallback).
 */
export interface StoredUser {
    id: string
    email: string
    auth_mode?: AuthMode
    auth_scope?: string
    auth_flags?: AuthFlag[]
    api_token?: string
    pendingSecureStoreClear?: boolean
}

export const CONFIG_VERSION = 2 as const

export interface Config extends Record<string, unknown> {
    config_version?: number
    user?: UserConfig
    users?: StoredUser[]
    update_channel?: UpdateChannel
    hc?: HelpCenterConfig
    workspace?: WorkspaceConfig

    // Legacy v1 fields — read for one-time migration, never written by current code.
    api_token?: string
    pendingSecureStoreClear?: boolean
    auth_mode?: AuthMode
    auth_scope?: string
    auth_flags?: AuthFlag[]
}

const KNOWN_CONFIG_KEYS: ReadonlySet<string> = new Set([
    'config_version',
    'user',
    'users',
    'update_channel',
    'hc',
    'workspace',
    // legacy v1 keys (tolerated until migration runs)
    'api_token',
    'pendingSecureStoreClear',
    'auth_mode',
    'auth_scope',
    'auth_flags',
])

const KNOWN_USER_CONFIG_KEYS: ReadonlySet<string> = new Set(['defaultUser'])
const KNOWN_STORED_USER_KEYS: ReadonlySet<string> = new Set([
    'id',
    'email',
    'auth_mode',
    'auth_scope',
    'auth_flags',
    'api_token',
    'pendingSecureStoreClear',
])

const KNOWN_HC_CONFIG_KEYS: ReadonlySet<string> = new Set(['defaultLocale'])
const KNOWN_WORKSPACE_CONFIG_KEYS: ReadonlySet<string> = new Set(['defaultWorkspace'])

const AUTH_MODES: ReadonlySet<AuthMode> = new Set(['read-only', 'read-write', 'unknown'])
export const AUTH_FLAGS: ReadonlySet<AuthFlag> = new Set(AUTH_FLAG_ORDER)
const UPDATE_CHANNELS: ReadonlySet<UpdateChannel> = new Set(['stable', 'pre-release'])

export async function readConfig(): Promise<Config> {
    // cli-core's readConfig returns Partial<T> via {} on any failure, so the
    // result is always an object — Config's all-optional fields make the cast safe.
    return (await readConfigCore<Config>(getConfigPath())) as Config
}

export type StrictReadResult = { state: 'missing' } | { state: 'present'; config: Config }

/**
 * Read and parse the config file strictly — for inspection commands that need
 * to distinguish "missing" from "present but broken". `readConfig` deliberately
 * swallows errors for runtime code paths; this one surfaces them.
 */
export async function readConfigStrict(): Promise<StrictReadResult> {
    const path = getConfigPath()
    const result = await readConfigStrictCore(path)
    switch (result.state) {
        case 'missing':
            return { state: 'missing' }
        case 'present':
            return { state: 'present', config: result.config as Config }
        case 'read-failed':
            throw new CliError(
                'CONFIG_READ_FAILED',
                `Could not read config file ${path}: ${result.error.message}`,
                ['Check file permissions, or run `td doctor` to diagnose'],
            )
        case 'invalid-json':
            throw new CliError(
                'CONFIG_INVALID_JSON',
                `Config file at ${path} is not valid JSON: ${result.error.message}`,
                [
                    'Fix the JSON by hand, or delete the file and re-authenticate with `td auth login`',
                ],
            )
        case 'invalid-shape':
            throw new CliError(
                'CONFIG_INVALID_SHAPE',
                `Config file at ${path} must contain a JSON object (got ${result.actual})`,
                [
                    'Fix the JSON by hand, or delete the file and re-authenticate with `td auth login`',
                ],
            )
    }
}

export async function writeConfig(config: Config): Promise<void> {
    await writeConfigCore(getConfigPath(), config, { deleteWhenEmpty: true })
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

    if (
        config.config_version !== undefined &&
        (typeof config.config_version !== 'number' || config.config_version < 1)
    ) {
        issues.push('config_version must be a positive number')
    }

    if (config.user !== undefined) {
        if (!isObject(config.user)) {
            issues.push('user must be an object')
        } else {
            for (const key of Object.keys(config.user)) {
                if (!KNOWN_USER_CONFIG_KEYS.has(key)) {
                    issues.push(`user contains unrecognized key "${key}"`)
                }
            }
            const defaultUser = (config.user as Record<string, unknown>).defaultUser
            if (defaultUser !== undefined && typeof defaultUser !== 'string') {
                issues.push('user.defaultUser must be a string')
            }
        }
    }

    if (config.users !== undefined) {
        if (!Array.isArray(config.users)) {
            issues.push('users must be an array')
        } else {
            for (const [i, entry] of config.users.entries()) {
                if (!isObject(entry)) {
                    issues.push(`users[${i}] must be an object`)
                    continue
                }
                for (const key of Object.keys(entry)) {
                    if (!KNOWN_STORED_USER_KEYS.has(key)) {
                        issues.push(`users[${i}] contains unrecognized key "${key}"`)
                    }
                }
                if (typeof entry.id !== 'string' || !entry.id) {
                    issues.push(`users[${i}].id must be a non-empty string`)
                }
                if (typeof entry.email !== 'string' || !entry.email) {
                    issues.push(`users[${i}].email must be a non-empty string`)
                }
                if (
                    entry.auth_mode !== undefined &&
                    (typeof entry.auth_mode !== 'string' ||
                        !AUTH_MODES.has(entry.auth_mode as AuthMode))
                ) {
                    issues.push(
                        `users[${i}].auth_mode must be one of: read-only, read-write, unknown`,
                    )
                }
                if (entry.auth_scope !== undefined && typeof entry.auth_scope !== 'string') {
                    issues.push(`users[${i}].auth_scope must be a string`)
                }
                if (entry.auth_flags !== undefined) {
                    if (
                        !Array.isArray(entry.auth_flags) ||
                        !entry.auth_flags.every(
                            (flag) => typeof flag === 'string' && AUTH_FLAGS.has(flag as AuthFlag),
                        )
                    ) {
                        issues.push(
                            `users[${i}].auth_flags must be an array of: ${AUTH_FLAG_ORDER.join(', ')}`,
                        )
                    }
                }
                if (entry.api_token !== undefined && typeof entry.api_token !== 'string') {
                    issues.push(`users[${i}].api_token must be a string`)
                }
                if (
                    entry.pendingSecureStoreClear !== undefined &&
                    typeof entry.pendingSecureStoreClear !== 'boolean'
                ) {
                    issues.push(`users[${i}].pendingSecureStoreClear must be a boolean`)
                }
            }
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

    if (config.workspace !== undefined) {
        if (!isObject(config.workspace)) {
            issues.push('workspace must be an object')
        } else {
            for (const key of Object.keys(config.workspace)) {
                if (!KNOWN_WORKSPACE_CONFIG_KEYS.has(key)) {
                    issues.push(`workspace contains unrecognized key "${key}"`)
                }
            }
            const defaultWorkspace = (config.workspace as Record<string, unknown>).defaultWorkspace
            if (defaultWorkspace !== undefined && typeof defaultWorkspace !== 'string') {
                issues.push('workspace.defaultWorkspace must be a string')
            }
        }
    }

    return issues
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}
