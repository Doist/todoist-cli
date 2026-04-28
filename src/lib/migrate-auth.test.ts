import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TEST_HOME = '/tmp/todoist-cli-tests-migrate'

interface KeyringEntryState {
    token: string | null
}

interface KeyringMockState {
    entries: Map<string, KeyringEntryState>
    available: boolean
}

function entryFor(state: KeyringMockState, account: string): KeyringEntryState {
    let e = state.entries.get(account)
    if (!e) {
        e = { token: null }
        state.entries.set(account, e)
    }
    return e
}

describe('migrateLegacyAuth', () => {
    let configContent: string | null
    let keyring: KeyringMockState

    beforeEach(() => {
        vi.resetModules()
        vi.clearAllMocks()

        configContent = null
        keyring = { entries: new Map(), available: true }

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

        vi.doMock('@napi-rs/keyring', () => ({
            AsyncEntry: class {
                private account: string
                constructor(_service: string, account: string) {
                    if (!keyring.available) throw new Error('keyring unavailable')
                    this.account = account
                }
                async getPassword(): Promise<string | null> {
                    return entryFor(keyring, this.account).token
                }
                async setPassword(p: string): Promise<void> {
                    entryFor(keyring, this.account).token = p
                }
                async deleteCredential(): Promise<boolean> {
                    const e = entryFor(keyring, this.account)
                    const had = e.token !== null
                    e.token = null
                    return had
                }
            },
        }))
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

    it('reports already-migrated when users array exists', async () => {
        setConfig({ config_version: 2, users: [] })

        const { migrateLegacyAuth } = await import('./migrate-auth.js')
        const result = await migrateLegacyAuth({ silent: true, fetchImpl: failingFetch })

        expect(result.status).toBe('already-migrated')
        expect(readConfig()).toEqual({ config_version: 2, users: [] })
    })

    it('reports no-legacy-state when config is empty and no keyring token', async () => {
        const { migrateLegacyAuth } = await import('./migrate-auth.js')
        const result = await migrateLegacyAuth({ silent: true, fetchImpl: failingFetch })

        expect(result.status).toBe('no-legacy-state')
        expect(readConfig()).toBeNull()
    })

    it('migrates a v1 plaintext token via REST user fetch', async () => {
        setConfig({
            api_token: 'legacy-1234567',
            auth_mode: 'read-write',
            auth_scope: 'data:read_write',
        })

        const fetchImpl = vi.fn(
            async () =>
                new Response(JSON.stringify({ id: '999', email: 'me@example.com' }), {
                    status: 200,
                }),
        )

        const { migrateLegacyAuth } = await import('./migrate-auth.js')
        const result = await migrateLegacyAuth({ silent: true, fetchImpl })

        expect(result).toMatchObject({
            status: 'migrated',
            migratedUserId: '999',
            migratedEmail: 'me@example.com',
        })
        expect(entryFor(keyring, 'user-999').token).toBe('legacy-1234567')
        expect(readConfig()).toEqual({
            config_version: 2,
            user: { defaultUser: '999' },
            users: [
                {
                    id: '999',
                    email: 'me@example.com',
                    auth_mode: 'read-write',
                    auth_scope: 'data:read_write',
                },
            ],
        })
    })

    it('migrates a legacy keyring token (api-token account)', async () => {
        entryFor(keyring, 'api-token').token = 'legacy-secure-1234567'

        const fetchImpl = vi.fn(
            async () => new Response(JSON.stringify({ id: '42', email: 'k@e.y' }), { status: 200 }),
        )

        const { migrateLegacyAuth } = await import('./migrate-auth.js')
        const result = await migrateLegacyAuth({ silent: true, fetchImpl })

        expect(result.status).toBe('migrated')
        expect(entryFor(keyring, 'user-42').token).toBe('legacy-secure-1234567')
        // legacy slot should be cleared
        expect(entryFor(keyring, 'api-token').token).toBeNull()
    })

    it('skips and leaves config untouched when fetch fails', async () => {
        setConfig({ api_token: 'legacy-1234567' })

        const fetchImpl = vi.fn(async () => new Response('boom', { status: 500 }))

        const { migrateLegacyAuth } = await import('./migrate-auth.js')
        const result = await migrateLegacyAuth({ silent: true, fetchImpl })

        expect(result.status).toBe('skipped')
        expect(readConfig()).toEqual({ api_token: 'legacy-1234567' })
    })

    it('is idempotent — second run after a successful migration is a no-op', async () => {
        setConfig({ api_token: 'legacy-1234567' })
        const fetchImpl = vi.fn(
            async () => new Response(JSON.stringify({ id: '7', email: 'a@b.c' }), { status: 200 }),
        )

        const { migrateLegacyAuth } = await import('./migrate-auth.js')

        const first = await migrateLegacyAuth({ silent: true, fetchImpl })
        expect(first.status).toBe('migrated')

        const second = await migrateLegacyAuth({ silent: true, fetchImpl })
        expect(second.status).toBe('already-migrated')
        // fetch only called once
        expect(fetchImpl).toHaveBeenCalledTimes(1)
    })
})

const failingFetch: typeof fetch = async () => {
    throw new Error('fetch should not be called')
}
