/**
 * One-time migration of v1 single-user auth state into the v2 multi-user
 * shape. Delegates to `@doist/cli-core/auth`'s generic `migrateLegacyAuth`,
 * supplying only the todoist-specific bits: the durable migration marker
 * (`config_version === CONFIG_VERSION`), how to read the v1 plaintext token,
 * how to identify the user behind a v1 token, and how to clean up the
 * top-level legacy fields after a successful migration.
 *
 * Invoked from `src/postinstall.ts`. Best-effort: any failure leaves v1 state
 * untouched so `resolveActiveUser`'s legacy fallback keeps serving the token
 * until the next attempt.
 */

import { migrateLegacyAuth as coreMigrateLegacyAuth } from '@doist/cli-core/auth'
import { toTodoistAccount, type TodoistAccount } from './auth-store.js'
import { type Config, CONFIG_VERSION, readConfig, writeConfig } from './config.js'
import { fetchTodoist } from './usage-tracking.js'
import { createTodoistUserRecordStore } from './user-records.js'

export interface MigrateAuthResult {
    status: 'already-migrated' | 'no-legacy-state' | 'migrated' | 'skipped'
    reason?: string
    migratedUserId?: string
    migratedEmail?: string
}

interface MigrateOptions {
    /** Suppress console output. Postinstall sets this; CLI surfaces use it via warn(). */
    silent?: boolean
    /** Override fetch (for tests). */
    fetchImpl?: typeof fetch
}

const USER_ENDPOINT = 'https://api.todoist.com/api/v1/user'

export async function migrateLegacyAuth(opts: MigrateOptions = {}): Promise<MigrateAuthResult> {
    const fetchImpl = opts.fetchImpl ?? fetch

    const result = await coreMigrateLegacyAuth<TodoistAccount>({
        serviceName: 'todoist-cli',
        legacyAccount: 'api-token',
        userRecords: createTodoistUserRecordStore(),
        silent: opts.silent,
        logPrefix: 'todoist-cli',
        // `config_version === CONFIG_VERSION` is the durable, one-way gate. It
        // survives logout (which clears `users[]` but leaves `config_version`),
        // so a reinstall over a logged-out v2 install cannot re-migrate a
        // stale legacy keyring entry.
        hasMigrated: async () => (await readConfig()).config_version === CONFIG_VERSION,
        markMigrated: async () => {
            const config = await readConfig()
            if (config.config_version === CONFIG_VERSION) return
            await writeConfig({ ...config, config_version: CONFIG_VERSION })
        },
        loadLegacyPlaintextToken: async () => {
            const config = await readConfig()
            return typeof config.api_token === 'string' && config.api_token.trim()
                ? config.api_token.trim()
                : null
        },
        identifyAccount: async (token) => {
            const config = await readConfig()
            const user = await fetchUser(token, fetchImpl)
            return toTodoistAccount({
                id: user.id,
                email: user.email,
                authMode: config.auth_mode ?? 'unknown',
                authScope: config.auth_scope,
                authFlags: config.auth_flags,
            })
        },
        cleanupLegacyConfig: async () => {
            const config = await readConfig()
            const {
                api_token: _t,
                auth_mode: _m,
                auth_scope: _s,
                auth_flags: _f,
                pendingSecureStoreClear: _p,
                ...rest
            } = config
            await writeConfig(rest as Config)
        },
    })

    return toLocalResult(result)
}

interface TodoistUser {
    id: string
    email: string
}

async function fetchUser(token: string, fetchImpl: typeof fetch): Promise<TodoistUser> {
    const response = await fetchTodoist(
        USER_ENDPOINT,
        { headers: { Authorization: `Bearer ${token}` } },
        fetchImpl,
        'postinstall:auth-migrate',
    )
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`)
    }
    const data = (await response.json()) as { id?: unknown; email?: unknown }
    if (typeof data.id !== 'string' || !data.id) {
        throw new Error('response missing user id')
    }
    if (typeof data.email !== 'string' || !data.email) {
        throw new Error('response missing user email')
    }
    return { id: data.id, email: data.email }
}

function toLocalResult(
    result: Awaited<ReturnType<typeof coreMigrateLegacyAuth<TodoistAccount>>>,
): MigrateAuthResult {
    if (result.status === 'migrated') {
        return {
            status: 'migrated',
            migratedUserId: result.account.id,
            migratedEmail: result.account.email,
        }
    }
    if (result.status === 'skipped') {
        return { status: 'skipped', reason: `${result.reason}: ${result.detail}` }
    }
    return { status: result.status }
}
