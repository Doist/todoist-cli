import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TEST_HOME = '/tmp/todoist-cli-tests'
const TEST_CONFIG_PATH = `${TEST_HOME}/.config/todoist-cli/config.json`

interface KeyringEntryState {
    token: string | null
    getCalls: number
    setCalls: string[]
    deleteCalls: number
}

interface KeyringMockState {
    entries: Map<string, KeyringEntryState>
    getError?: Error
    setError?: Error
    deleteError?: Error
    constructed: { service: string; account: string }[]
}

function entryFor(state: KeyringMockState, account: string): KeyringEntryState {
    let e = state.entries.get(account)
    if (!e) {
        e = { token: null, getCalls: 0, setCalls: [], deleteCalls: 0 }
        state.entries.set(account, e)
    }
    return e
}

describe('lib/auth', () => {
    let configContent: string | null
    let configWriteError: Error | null
    let mkdirMock: ReturnType<typeof vi.fn>
    let readFileMock: ReturnType<typeof vi.fn>
    let unlinkMock: ReturnType<typeof vi.fn>
    let writeFileMock: ReturnType<typeof vi.fn>
    let keyring: KeyringMockState
    let errorSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.resetModules()
        vi.clearAllMocks()
        vi.unstubAllEnvs()

        configContent = null
        configWriteError = null
        keyring = {
            entries: new Map(),
            constructed: [],
        }

        mkdirMock = vi.fn().mockResolvedValue(undefined)
        readFileMock = vi.fn().mockImplementation(async () => {
            if (configContent === null) {
                throw createErrnoError('ENOENT')
            }
            return configContent
        })
        unlinkMock = vi.fn().mockImplementation(async () => {
            if (configContent === null) {
                throw createErrnoError('ENOENT')
            }
            configContent = null
        })
        writeFileMock = vi.fn().mockImplementation(async (_path: string, content: string) => {
            if (configWriteError) {
                throw configWriteError
            }
            configContent = content
        })

        vi.doMock('node:os', () => ({
            homedir: () => TEST_HOME,
        }))

        vi.doMock('node:fs/promises', () => ({
            chmod: vi.fn().mockResolvedValue(undefined),
            mkdir: mkdirMock,
            readFile: readFileMock,
            unlink: unlinkMock,
            writeFile: writeFileMock,
        }))

        vi.doMock('@napi-rs/keyring', () => ({
            AsyncEntry: class {
                private account: string
                constructor(service: string, account: string) {
                    this.account = account
                    keyring.constructed.push({ service, account })
                }

                async getPassword(): Promise<string | null> {
                    if (keyring.getError) throw keyring.getError
                    const e = entryFor(keyring, this.account)
                    e.getCalls += 1
                    return e.token
                }

                async setPassword(password: string): Promise<void> {
                    if (keyring.setError) throw keyring.setError
                    const e = entryFor(keyring, this.account)
                    e.token = password
                    e.setCalls.push(password)
                }

                async deleteCredential(): Promise<boolean> {
                    if (keyring.deleteError) throw keyring.deleteError
                    const e = entryFor(keyring, this.account)
                    const had = e.token !== null
                    e.token = null
                    e.deleteCalls += 1
                    return had
                }
            },
        }))

        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        errorSpy.mockRestore()
        vi.unstubAllEnvs()
    })

    // --- env var --------------------------------------------------------------

    it('TODOIST_API_TOKEN bypasses stored users', async () => {
        vi.stubEnv('TODOIST_API_TOKEN', 'env-token-123456')
        setConfig({
            config_version: 2,
            users: [{ id: '1', email: 'a@b.c', api_token: 'config-token' }],
        })

        const { getApiToken, resolveActiveUser } = await import('./auth.js')

        await expect(getApiToken()).resolves.toBe('env-token-123456')
        await expect(resolveActiveUser()).resolves.toMatchObject({
            id: 'env',
            source: 'env',
        })
        expect(keyring.constructed).toEqual([])
    })

    // --- upsertUser -----------------------------------------------------------

    it('upsertUser stores token in per-user keyring slot and writes v2 config', async () => {
        const { upsertUser } = await import('./auth.js')

        const result = await upsertUser({
            id: '12345',
            email: 'scott@doist.com',
            token: 'oauth-token-1234567',
            authMode: 'read-write',
            authScope: 'data:read_write',
        })

        expect(result).toEqual({ storage: 'secure-store', replaced: false })
        expect(entryFor(keyring, 'user-12345').token).toBe('oauth-token-1234567')
        expect(readConfig()).toEqual({
            config_version: 2,
            user: { defaultUser: '12345' },
            users: [
                {
                    id: '12345',
                    email: 'scott@doist.com',
                    auth_mode: 'read-write',
                    auth_scope: 'data:read_write',
                },
            ],
        })
    })

    it('upsertUser does NOT overwrite an existing default when adding a second user', async () => {
        setConfig({
            config_version: 2,
            user: { defaultUser: '111' },
            users: [{ id: '111', email: 'first@example.com' }],
        })

        const { upsertUser } = await import('./auth.js')

        const result = await upsertUser({
            id: '222',
            email: 'second@example.com',
            token: 'second-token-1234567',
        })

        expect(result.replaced).toBe(false)
        const config = readConfig() as Record<string, unknown>
        expect(config.user).toEqual({ defaultUser: '111' })
        expect((config.users as { id: string }[]).map((u) => u.id)).toEqual(['111', '222'])
    })

    it('upsertUser replaces existing record for same id', async () => {
        setConfig({
            config_version: 2,
            user: { defaultUser: '111' },
            users: [{ id: '111', email: 'old@example.com', auth_mode: 'read-only' }],
        })

        const { upsertUser } = await import('./auth.js')

        const result = await upsertUser({
            id: '111',
            email: 'new@example.com',
            token: 'new-token-1234567',
            authMode: 'read-write',
        })

        expect(result.replaced).toBe(true)
        expect((readConfig() as { users: unknown[] }).users).toEqual([
            {
                id: '111',
                email: 'new@example.com',
                auth_mode: 'read-write',
            },
        ])
    })

    it('upsertUser falls back to plaintext per-user config when keyring unavailable', async () => {
        keyring.setError = new Error('Keychain unavailable')

        const { upsertUser } = await import('./auth.js')

        const result = await upsertUser({
            id: '12345',
            email: 'a@b.c',
            token: 'fallback-token-1234567',
        })

        expect(result).toEqual({
            storage: 'config-file',
            replaced: false,
            warning: `system credential manager unavailable; token saved as plaintext in ${TEST_CONFIG_PATH}`,
        })
        const stored = (readConfig() as { users: { api_token?: string }[] }).users[0]
        expect(stored.api_token).toBe('fallback-token-1234567')
    })

    // --- resolveActiveUser ----------------------------------------------------

    it('resolves single stored user implicitly', async () => {
        setConfig({
            config_version: 2,
            users: [{ id: '111', email: 'a@b.c' }],
        })
        entryFor(keyring, 'user-111').token = 'stored-token'

        const { resolveActiveUser } = await import('./auth.js')

        await expect(resolveActiveUser()).resolves.toMatchObject({
            id: '111',
            email: 'a@b.c',
            token: 'stored-token',
            source: 'secure-store',
        })
    })

    it('resolves the configured default user when multiple are stored', async () => {
        setConfig({
            config_version: 2,
            user: { defaultUser: '222' },
            users: [
                { id: '111', email: 'a@b.c' },
                { id: '222', email: 'd@e.f' },
            ],
        })
        entryFor(keyring, 'user-222').token = 'token-222'

        const { resolveActiveUser } = await import('./auth.js')

        await expect(resolveActiveUser()).resolves.toMatchObject({ id: '222', token: 'token-222' })
    })

    it('errors when multiple users are stored without a default and no --user', async () => {
        setConfig({
            config_version: 2,
            users: [
                { id: '111', email: 'a@b.c' },
                { id: '222', email: 'd@e.f' },
            ],
        })

        const { resolveActiveUser } = await import('./auth.js')
        const { NoUserSelectedError } = await import('./users.js')

        await expect(resolveActiveUser()).rejects.toBeInstanceOf(NoUserSelectedError)
    })

    it('honors an explicit ref override', async () => {
        setConfig({
            config_version: 2,
            user: { defaultUser: '111' },
            users: [
                { id: '111', email: 'a@b.c' },
                { id: '222', email: 'D@E.F' },
            ],
        })
        entryFor(keyring, 'user-222').token = 'token-222'

        const { resolveActiveUser } = await import('./auth.js')

        // case-insensitive email match
        await expect(resolveActiveUser({ ref: 'd@e.f' })).resolves.toMatchObject({
            id: '222',
            token: 'token-222',
        })
        // exact id match
        await expect(resolveActiveUser({ ref: '222' })).resolves.toMatchObject({ id: '222' })
    })

    it('throws UserNotFoundError when ref does not match', async () => {
        setConfig({
            config_version: 2,
            users: [{ id: '111', email: 'a@b.c' }],
        })

        const { resolveActiveUser } = await import('./auth.js')
        const { UserNotFoundError } = await import('./users.js')

        await expect(resolveActiveUser({ ref: 'nope' })).rejects.toBeInstanceOf(UserNotFoundError)
    })

    // --- legacy fallback ------------------------------------------------------

    it('serves a legacy config token when no v2 users exist (graceful fallback)', async () => {
        setConfig({
            api_token: 'legacy-token-1234567',
            auth_mode: 'read-write',
        })

        const { resolveActiveUser } = await import('./auth.js')

        const resolved = await resolveActiveUser()
        expect(resolved.id).toBe('legacy')
        expect(resolved.token).toBe('legacy-token-1234567')
        expect(resolved.authMode).toBe('read-write')
        // does NOT auto-migrate at runtime — that's postinstall's job
        expect(readConfig()).toEqual({
            api_token: 'legacy-token-1234567',
            auth_mode: 'read-write',
        })
    })

    it('serves a legacy keyring token when no v2 users and no plaintext', async () => {
        entryFor(keyring, 'api-token').token = 'legacy-secure-1234567'

        const { resolveActiveUser } = await import('./auth.js')

        const resolved = await resolveActiveUser()
        expect(resolved.id).toBe('legacy')
        expect(resolved.token).toBe('legacy-secure-1234567')
        expect(resolved.source).toBe('secure-store')
    })

    it('treats v1 pendingSecureStoreClear as logged out', async () => {
        setConfig({ pendingSecureStoreClear: true })
        entryFor(keyring, 'api-token').token = 'stale-1234567'

        const { resolveActiveUser, NoTokenError } = await import('./auth.js')

        await expect(resolveActiveUser()).rejects.toBeInstanceOf(NoTokenError)
    })

    // --- removeUserById / clearApiToken --------------------------------------

    it('removeUserById deletes keyring slot, removes user record, and clears default if matched', async () => {
        setConfig({
            config_version: 2,
            user: { defaultUser: '111' },
            users: [
                { id: '111', email: 'a@b.c' },
                { id: '222', email: 'd@e.f' },
            ],
        })
        entryFor(keyring, 'user-111').token = 't1'
        entryFor(keyring, 'user-222').token = 't2'

        const { removeUserById } = await import('./auth.js')

        await expect(removeUserById('111')).resolves.toEqual({ storage: 'secure-store' })

        expect(entryFor(keyring, 'user-111').token).toBeNull()
        const config = readConfig() as Record<string, unknown>
        expect((config.users as { id: string }[]).map((u) => u.id)).toEqual(['222'])
        expect(config.user).toBeUndefined()
    })

    it('clearApiToken errors when multiple users are stored without --user', async () => {
        setConfig({
            config_version: 2,
            users: [
                { id: '111', email: 'a@b.c' },
                { id: '222', email: 'd@e.f' },
            ],
        })

        const { clearApiToken } = await import('./auth.js')
        const { NoUserSelectedError } = await import('./users.js')

        await expect(clearApiToken()).rejects.toBeInstanceOf(NoUserSelectedError)
    })

    it('clearApiToken targets the default user when one is set', async () => {
        setConfig({
            config_version: 2,
            user: { defaultUser: '222' },
            users: [
                { id: '111', email: 'a@b.c' },
                { id: '222', email: 'd@e.f' },
            ],
        })
        entryFor(keyring, 'user-111').token = 't1'
        entryFor(keyring, 'user-222').token = 't2'

        const { clearApiToken } = await import('./auth.js')
        await clearApiToken()

        expect(entryFor(keyring, 'user-222').token).toBeNull()
        expect((readConfig() as { users: { id: string }[] }).users).toEqual([
            { id: '111', email: 'a@b.c' },
        ])
    })

    it('clearApiToken cleans up legacy state when no v2 users exist', async () => {
        setConfig({ api_token: 'legacy-1234567' })

        const { clearApiToken } = await import('./auth.js')

        await expect(clearApiToken()).resolves.toEqual({ storage: 'secure-store' })
        expect(readConfig()).toBeNull()
    })

    // --- listStoredUsers / setDefaultUserId -----------------------------------

    it('setDefaultUserId only accepts a stored user', async () => {
        setConfig({
            config_version: 2,
            users: [{ id: '111', email: 'a@b.c' }],
        })

        const { setDefaultUserId } = await import('./auth.js')
        const { UserNotFoundError } = await import('./users.js')

        await expect(setDefaultUserId('999')).rejects.toBeInstanceOf(UserNotFoundError)
        await setDefaultUserId('111')
        expect((readConfig() as { user?: { defaultUser?: string } }).user).toEqual({
            defaultUser: '111',
        })
    })

    function setConfig(config: Record<string, unknown>): void {
        configContent = `${JSON.stringify(config, null, 2)}\n`
    }

    function readConfig(): Record<string, unknown> | null {
        return configContent ? (JSON.parse(configContent) as Record<string, unknown>) : null
    }

    function createErrnoError(code: string): Error & { code: string } {
        const error = new Error(code) as Error & { code: string }
        error.code = code
        return error
    }
})
