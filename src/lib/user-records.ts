import type { UserRecord, UserRecordStore } from '@doist/cli-core/auth'
import type { TodoistAccount } from './auth-store.js'
import { type Config, CONFIG_VERSION, readConfig, type StoredUser, writeConfig } from './config.js'

function recordToStoredUser(record: UserRecord<TodoistAccount>): StoredUser {
    const stored: StoredUser = {
        id: record.account.id,
        email: record.account.email,
        auth_mode: record.account.auth_mode,
        auth_scope: record.account.auth_scope,
        auth_flags: record.account.auth_flags,
    }
    if (record.fallbackToken !== undefined) {
        stored.api_token = record.fallbackToken
    }
    return stored
}

function storedUserToRecord(user: StoredUser): UserRecord<TodoistAccount> {
    const record: UserRecord<TodoistAccount> = {
        account: {
            id: user.id,
            label: user.email,
            email: user.email,
            auth_mode: user.auth_mode ?? 'unknown',
            auth_scope: user.auth_scope,
            auth_flags: user.auth_flags,
        },
    }
    if (user.api_token !== undefined) {
        record.fallbackToken = user.api_token
    }
    return record
}

/**
 * Normalize to the v2 on-disk shape on every write: stamp `config_version`,
 * default `users` to `[]`, and strip top-level legacy v1 fields so a stale
 * `api_token`/`auth_mode` can't outlive a successful multi-user write.
 */
function ensureV2(config: Config): Config {
    const {
        api_token: _t,
        auth_mode: _m,
        auth_scope: _s,
        auth_flags: _f,
        pendingSecureStoreClear: _p,
        ...rest
    } = config
    return {
        ...rest,
        config_version: CONFIG_VERSION,
        users: Array.isArray(rest.users) ? rest.users : [],
    }
}

function withoutDefaultUser(config: Config): Config {
    if (!config.user) return config
    const { defaultUser: _d, ...restUser } = config.user
    if (Object.keys(restUser).length > 0) {
        return { ...config, user: restUser }
    }
    const { user: _u, ...rest } = config
    return rest as Config
}

/**
 * `UserRecordStore<TodoistAccount>` backed by the existing JSON config file.
 *
 * REPLACE, do not merge: `upsert` rebuilds the `StoredUser` entirely from the
 * incoming record so a stale `api_token` from a prior offline-fallback write
 * cannot outlive a later keyring-online write (cli-core preferentially reads
 * `fallbackToken` over the keyring).
 */
export function createTodoistUserRecordStore(): UserRecordStore<TodoistAccount> {
    return {
        async list() {
            const config = await readConfig()
            const users = Array.isArray(config.users) ? config.users : []
            return users.map(storedUserToRecord)
        },

        async upsert(record) {
            const base = ensureV2(await readConfig())
            const next = recordToStoredUser(record)
            const users = (base.users ?? []).slice()
            const idx = users.findIndex((u) => u.id === record.account.id)
            if (idx >= 0) {
                users[idx] = next
            } else {
                users.push(next)
            }
            await writeConfig({ ...base, users })
        },

        async remove(id) {
            const base = ensureV2(await readConfig())
            const users = (base.users ?? []).filter((u) => u.id !== id)
            let nextConfig: Config = { ...base, users }
            if (nextConfig.user?.defaultUser === id) {
                nextConfig = withoutDefaultUser(nextConfig)
            }
            await writeConfig(nextConfig)
        },

        async getDefaultId() {
            const config = await readConfig()
            return config.user?.defaultUser ?? null
        },

        async setDefaultId(id) {
            const base = ensureV2(await readConfig())
            if (id === null) {
                await writeConfig(withoutDefaultUser(base))
                return
            }
            await writeConfig({ ...base, user: { ...base.user, defaultUser: id } })
        },
    }
}
