import type { UserRecord, UserRecordStore } from '@doist/cli-core/auth'
import { toTodoistAccount, type TodoistAccount } from './auth-store.js'
import {
    type Config,
    CONFIG_VERSION,
    readConfig,
    type StoredUser,
    stripLegacyAuthFields,
    writeConfig,
} from './config.js'
import { clearDefaultUser, removeStoredUser, setDefaultUser, upsertStoredUser } from './users.js'

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
        account: toTodoistAccount({
            id: user.id,
            email: user.email,
            authMode: user.auth_mode ?? 'unknown',
            authScope: user.auth_scope,
            authFlags: user.auth_flags,
        }),
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
    const stripped = stripLegacyAuthFields(config)
    return {
        ...stripped,
        config_version: CONFIG_VERSION,
        users: Array.isArray(stripped.users) ? stripped.users : [],
    }
}

/**
 * `UserRecordStore<TodoistAccount>` backed by the existing JSON config file.
 *
 * REPLACE, do not merge: `upsert` rebuilds the `StoredUser` entirely from the
 * incoming record so a stale `api_token` from a prior offline-fallback write
 * cannot outlive a later keyring-online write (cli-core preferentially reads
 * `fallbackToken` over the keyring).
 *
 * Array manipulation (upsert / remove / default-pointer maintenance)
 * delegates to the same helpers `users.ts` exposes to the rest of the CLI
 * (`upsertStoredUser`, `removeStoredUser`, `setDefaultUser`,
 * `clearDefaultUser`) so the on-disk config layout has one set of mutators.
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
            const next = upsertStoredUser(base, recordToStoredUser(record)).config
            await writeConfig(next)
        },

        async remove(id) {
            const base = ensureV2(await readConfig())
            await writeConfig(removeStoredUser(base, id))
        },

        async getDefaultId() {
            const config = await readConfig()
            return config.user?.defaultUser ?? null
        },

        async setDefaultId(id) {
            const base = ensureV2(await readConfig())
            await writeConfig(id === null ? clearDefaultUser(base) : setDefaultUser(base, id))
        },
    }
}
