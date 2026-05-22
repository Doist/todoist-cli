/**
 * Coverage for the `UserRecordStore<TodoistAccount>` adapter — the on-disk
 * config layout cli-core's keyring TokenStore is wired against. The migration
 * helper (`migrate-auth.ts`) and every write-side command go through this
 * adapter, so the REPLACE-not-merge contract, the legacy-fields strip, and
 * the default-pointer cleanup on remove all need direct coverage.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const TEST_HOME = '/tmp/todoist-cli-user-records-tests'
const TEST_CONFIG_PATH = `${TEST_HOME}/.config/todoist-cli/config.json`

describe('createTodoistUserRecordStore', () => {
    let configContent: string | null

    beforeEach(() => {
        vi.resetModules()
        vi.clearAllMocks()

        configContent = null

        vi.doMock('node:os', () => ({ homedir: () => TEST_HOME }))
        vi.doMock('node:fs/promises', () => ({
            chmod: vi.fn().mockResolvedValue(undefined),
            mkdir: vi.fn().mockResolvedValue(undefined),
            readFile: vi.fn().mockImplementation(async () => {
                if (configContent === null) {
                    const err = new Error('ENOENT') as Error & { code: string }
                    err.code = 'ENOENT'
                    throw err
                }
                return configContent
            }),
            unlink: vi.fn().mockImplementation(async () => {
                configContent = null
            }),
            writeFile: vi.fn().mockImplementation(async (_path: string, content: string) => {
                configContent = content
            }),
        }))

        vi.doMock('@doist/cli-core', async (importOriginal) => {
            const actual = await importOriginal<typeof import('@doist/cli-core')>()
            return { ...actual, getConfigPath: () => TEST_CONFIG_PATH }
        })
    })

    function setConfig(config: unknown): void {
        configContent = `${JSON.stringify(config, null, 2)}\n`
    }

    function readPersisted(): Record<string, unknown> | null {
        return configContent ? (JSON.parse(configContent) as Record<string, unknown>) : null
    }

    const ACCOUNT_A = {
        id: '111',
        email: 'a@example.com',
        label: 'a@example.com',
        auth_mode: 'read-write' as const,
        auth_scope: 'data:read_write',
    }

    it('upsert REPLACES the StoredUser — a stale fallbackToken is dropped on a keyring-online write', async () => {
        // Pre-existing record with a plaintext fallback (prior offline-fallback write).
        setConfig({
            config_version: 2,
            users: [{ id: '111', email: 'a@example.com', api_token: 'stale-plaintext-1234567' }],
        })

        const { createTodoistUserRecordStore } = await import('./user-records.js')
        await createTodoistUserRecordStore().upsert({ account: ACCOUNT_A })

        const persisted = readPersisted() as { users: { api_token?: string }[] }
        expect(persisted.users[0]).toEqual({
            id: '111',
            email: 'a@example.com',
            auth_mode: 'read-write',
            auth_scope: 'data:read_write',
        })
        // `api_token` MUST be gone — leaving it behind would let the runtime
        // preferentially serve the stale plaintext over the fresh keyring write.
        expect(persisted.users[0].api_token).toBeUndefined()
    })

    it('upsert preserves fallbackToken when supplied (keyring-offline write)', async () => {
        const { createTodoistUserRecordStore } = await import('./user-records.js')
        await createTodoistUserRecordStore().upsert({
            account: ACCOUNT_A,
            fallbackToken: 'plaintext-1234567',
        })

        const persisted = readPersisted() as { users: { api_token?: string }[] }
        expect(persisted.users[0].api_token).toBe('plaintext-1234567')
    })

    it('every write strips top-level v1 legacy fields (ensureV2)', async () => {
        // Pre-migration config with legacy top-level state still hanging around.
        setConfig({
            api_token: 'legacy-1234567',
            auth_mode: 'read-write',
            auth_scope: 'data:read_write',
            auth_flags: ['read-only'],
            pendingSecureStoreClear: true,
        })

        const { createTodoistUserRecordStore } = await import('./user-records.js')
        await createTodoistUserRecordStore().upsert({ account: ACCOUNT_A })

        const persisted = readPersisted() as Record<string, unknown>
        expect(persisted).toEqual({
            config_version: 2,
            users: [
                {
                    id: '111',
                    email: 'a@example.com',
                    auth_mode: 'read-write',
                    auth_scope: 'data:read_write',
                },
            ],
        })
    })

    it('remove drops the matching record and clears the default pointer when it matched the removed user', async () => {
        setConfig({
            config_version: 2,
            user: { defaultUser: '111' },
            users: [
                { id: '111', email: 'a@example.com' },
                { id: '222', email: 'b@example.com' },
            ],
        })

        const { createTodoistUserRecordStore } = await import('./user-records.js')
        await createTodoistUserRecordStore().remove('111')

        const persisted = readPersisted() as { users: { id: string }[]; user?: unknown }
        expect(persisted.users.map((u) => u.id)).toEqual(['222'])
        // Default pointed at the removed user — must be cleared (otherwise the
        // resolver would keep targeting an orphan id).
        expect(persisted.user).toBeUndefined()
    })
})
