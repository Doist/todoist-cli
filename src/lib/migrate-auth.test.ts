import type { MigrateAuthResult, MigrateLegacyAuthOptions } from '@doist/cli-core/auth'
/**
 * Adapter-level tests for the local `migrate-auth.ts` wrapper. The actual
 * migration mechanics (keyring read/write, default promotion, rollback)
 * live in cli-core and are covered by its own `migrate.test.ts`. Here we
 * verify only the todoist-specific glue we pass into cli-core: the legacy
 * plaintext loader, the `/api/v1/user` identifier callback, and the
 * legacy-config cleanup hook.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TodoistAccount } from './auth-store.js'

const TEST_HOME = '/tmp/todoist-cli-tests-migrate'
const TEST_CONFIG_PATH = `${TEST_HOME}/.config/todoist-cli/config.json`

// Capture the options object the wrapper passes into cli-core. Each test
// re-imports the wrapper after mocks are installed so the captured value is
// scoped to one test. `coreResult` lets a test pre-load the return value the
// stubbed `migrateLegacyAuth` should resolve to — needed for the
// `toLocalResult` translation cases that don't have a real cli-core run to
// observe.
let capturedOptions: MigrateLegacyAuthOptions<TodoistAccount> | undefined
let coreResult: MigrateAuthResult<TodoistAccount>

describe('migrateLegacyAuth (todoist-cli wrapper)', () => {
    let configContent: string | null

    beforeEach(() => {
        vi.resetModules()
        vi.clearAllMocks()
        capturedOptions = undefined
        coreResult = { status: 'no-legacy-state' }

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
            return {
                ...actual,
                getConfigPath: () => TEST_CONFIG_PATH,
            }
        })

        // Stub cli-core's migration so we observe what the wrapper passes in
        // and can drive each consumer callback directly.
        vi.doMock('@doist/cli-core/auth', async (importOriginal) => {
            const actual = await importOriginal<typeof import('@doist/cli-core/auth')>()
            return {
                ...actual,
                migrateLegacyAuth: vi.fn(
                    async (options: MigrateLegacyAuthOptions<TodoistAccount>) => {
                        capturedOptions = options
                        return coreResult
                    },
                ),
            }
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    function setConfig(config: unknown): void {
        configContent = `${JSON.stringify(config, null, 2)}\n`
    }

    function readConfig(): Record<string, unknown> | null {
        return configContent ? (JSON.parse(configContent) as Record<string, unknown>) : null
    }

    describe('hasMigrated / markMigrated (the one-way gate)', () => {
        it('hasMigrated returns true when config_version is at CONFIG_VERSION', async () => {
            setConfig({ config_version: 2, users: [] })
            const { migrateLegacyAuth } = await import('./migrate-auth.js')
            await migrateLegacyAuth({ silent: true })
            await expect(capturedOptions?.hasMigrated()).resolves.toBe(true)
        })

        it('hasMigrated returns false on a pre-v2 config (lets cli-core proceed)', async () => {
            setConfig({ api_token: 'legacy-1234567' })
            const { migrateLegacyAuth } = await import('./migrate-auth.js')
            await migrateLegacyAuth({ silent: true })
            await expect(capturedOptions?.hasMigrated()).resolves.toBe(false)
        })

        it('markMigrated stamps config_version without touching the legacy fields', async () => {
            // Legacy strip is cleanupLegacyConfig's job — markMigrated only
            // sets the durable gate so a later logout + reinstall can't
            // re-migrate the (now stale) legacy token.
            setConfig({ api_token: 'legacy-1234567', auth_mode: 'read-write' })
            const { migrateLegacyAuth } = await import('./migrate-auth.js')
            await migrateLegacyAuth({ silent: true })
            await capturedOptions?.markMigrated()
            expect(readConfig()).toEqual({
                api_token: 'legacy-1234567',
                auth_mode: 'read-write',
                config_version: 2,
            })
        })
    })

    it('loadLegacyPlaintextToken returns config.api_token when set', async () => {
        setConfig({ api_token: '  legacy-token-1234567  ' })
        const { migrateLegacyAuth } = await import('./migrate-auth.js')
        await migrateLegacyAuth({ silent: true })

        await expect(capturedOptions?.loadLegacyPlaintextToken()).resolves.toBe(
            'legacy-token-1234567',
        )
    })

    it('identifyAccount calls /api/v1/user with the bearer token and todoist headers', async () => {
        setConfig({ auth_mode: 'read-write', auth_scope: 'data:read_write' })
        const fetchImpl = vi.fn(
            async () =>
                new Response(JSON.stringify({ id: '999', email: 'me@example.com' }), {
                    status: 200,
                }),
        )

        const { migrateLegacyAuth } = await import('./migrate-auth.js')
        await migrateLegacyAuth({ silent: true, fetchImpl })

        const account = await capturedOptions?.identifyAccount('legacy-token-1234567')

        expect(account).toEqual({
            id: '999',
            email: 'me@example.com',
            label: 'me@example.com',
            auth_mode: 'read-write',
            auth_scope: 'data:read_write',
            auth_flags: undefined,
        })
        expect(fetchImpl).toHaveBeenCalledWith(
            'https://api.todoist.com/api/v1/user',
            expect.objectContaining({
                headers: expect.objectContaining({
                    authorization: 'Bearer legacy-token-1234567',
                    'doist-platform': 'cli',
<<<<<<< HEAD
                    'doist-version': expect.stringMatching(/^\d+\.\d+\.\d+(-[\w.]+)?$/),
                    'request-id': expect.any(String),
                    'session-id': expect.any(String),
=======
>>>>>>> origin/main
                    'cli-command': 'postinstall:auth-migrate',
                }),
            }),
        )
    })

    it('identifyAccount throws when the API request fails', async () => {
        const fetchImpl = vi.fn(async () => new Response('boom', { status: 500 }))
        const { migrateLegacyAuth } = await import('./migrate-auth.js')
        await migrateLegacyAuth({ silent: true, fetchImpl })

        await expect(capturedOptions?.identifyAccount('any-token-1234567')).rejects.toThrow(/500/)
    })

    describe('toLocalResult translation', () => {
        it('migrated → migratedUserId + migratedEmail (the local result shape)', async () => {
            coreResult = {
                status: 'migrated',
                account: {
                    id: '999',
                    email: 'me@example.com',
                    label: 'me@example.com',
                    auth_mode: 'read-write',
                },
            }

            const { migrateLegacyAuth } = await import('./migrate-auth.js')
            const result = await migrateLegacyAuth({ silent: true })

            expect(result).toEqual({
                status: 'migrated',
                migratedUserId: '999',
                migratedEmail: 'me@example.com',
            })
        })

        it('skipped → flattens cli-core reason + detail into one string', async () => {
            coreResult = {
                status: 'skipped',
                reason: 'identify-failed',
                detail: 'HTTP 500 boom',
            }

            const { migrateLegacyAuth } = await import('./migrate-auth.js')
            const result = await migrateLegacyAuth({ silent: true })

            expect(result).toEqual({
                status: 'skipped',
                reason: 'identify-failed: HTTP 500 boom',
            })
        })
    })

    it('cleanupLegacyConfig strips top-level v1 fields', async () => {
        setConfig({
            api_token: 'legacy-1234567',
            auth_mode: 'read-write',
            auth_scope: 'data:read_write',
            auth_flags: ['read-only'],
            pendingSecureStoreClear: true,
            config_version: 2,
            users: [{ id: '999', email: 'me@example.com' }],
            user: { defaultUser: '999' },
        })

        const { migrateLegacyAuth } = await import('./migrate-auth.js')
        await migrateLegacyAuth({ silent: true })

        await capturedOptions?.cleanupLegacyConfig?.()

        expect(readConfig()).toEqual({
            config_version: 2,
            users: [{ id: '999', email: 'me@example.com' }],
            user: { defaultUser: '999' },
        })
    })
})
