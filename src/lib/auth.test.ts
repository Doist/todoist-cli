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

        // Override @doist/cli-core's getConfigPath at the package boundary so
        // we don't depend on `node:os` mock substitution reaching cli-core's
        // compiled `homedir()` call — that route works on macOS but not on
        // Linux runners under vitest 4's `server.deps.inline`. The node:os
        // mock above is left in place for any other code that reads homedir
        // directly.
        vi.doMock('@doist/cli-core', async () => {
            const actual =
                await vi.importActual<typeof import('@doist/cli-core')>('@doist/cli-core')
            return {
                ...actual,
                getConfigPath: () => TEST_CONFIG_PATH,
            }
        })
<<<<<<< HEAD

        vi.doMock('@napi-rs/keyring', () => ({
            AsyncEntry: class {
                private account: string
                constructor(service: string, account: string) {
                    this.account = account
                    keyring.constructed.push({ service, account })
                }
=======
>>>>>>> origin/main

        // Mock cli-core's `createSecureStore` directly. Inlining cli-core via
        // `server.deps.inline` is not sufficient on Linux + npm-linked cli-core:
        // the dynamic `import('@napi-rs/keyring')` inside cli-core resolves
        // against the symlink target and bypasses vitest's mock. Mocking
        // `@doist/cli-core/auth` is the reliable boundary — it preserves the
        // typed `SecureStoreUnavailableError` re-export so the actual class
        // identity carries across the test/import boundary.
        vi.doMock('@doist/cli-core/auth', async (importOriginal) => {
            const actual = await importOriginal<typeof import('@doist/cli-core/auth')>()
            const { SecureStoreUnavailableError } = actual
            return {
                ...actual,
                createSecureStore: ({
                    serviceName,
                    account,
                }: {
                    serviceName: string
                    account: string
                }) => {
                    keyring.constructed.push({ service: serviceName, account })
                    return {
                        async getSecret() {
                            if (keyring.getError) {
                                throw new SecureStoreUnavailableError(keyring.getError.message)
                            }
                            const e = entryFor(keyring, account)
                            e.getCalls += 1
                            return e.token
                        },
                        async setSecret(password: string) {
                            if (keyring.setError) {
                                throw new SecureStoreUnavailableError(keyring.setError.message)
                            }
                            const e = entryFor(keyring, account)
                            e.token = password
                            e.setCalls.push(password)
                        },
                        async deleteSecret() {
                            if (keyring.deleteError) {
                                throw new SecureStoreUnavailableError(keyring.deleteError.message)
                            }
                            const e = entryFor(keyring, account)
                            const had = e.token !== null
                            e.token = null
                            e.deleteCalls += 1
                            return had
                        },
                    }
                },
            }
        })

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

    // --- probe / metadata under keyring failure -------------------------------

    it('probeApiToken surfaces SecureStoreUnavailableError instead of NoTokenError', async () => {
        // Stored v2 user, no plaintext fallback; keyring is offline. The
        // diagnostic surface needs to tell "credentials missing" apart from
        // "credential manager broken".
        setConfig({
            config_version: 2,
            users: [{ id: '111', email: 'a@b.c' }],
        })
        keyring.getError = new Error('keychain locked')

        const { probeApiToken } = await import('./auth.js')
        const { SecureStoreUnavailableError } = await import('@doist/cli-core/auth')

        await expect(probeApiToken()).rejects.toBeInstanceOf(SecureStoreUnavailableError)
    })

    it('getAuthMetadata degrades to unknown when the keyring is offline', async () => {
        // Permission/scope checks must not hard-fail when the credential
        // store is unavailable — they fall through to the same "unknown"
        // default they use when no token exists.
        setConfig({
            config_version: 2,
            users: [{ id: '111', email: 'a@b.c' }],
        })
        keyring.getError = new Error('keychain locked')

        const { getAuthMetadata } = await import('./auth.js')

        await expect(getAuthMetadata()).resolves.toEqual({
            authMode: 'unknown',
            source: 'secure-store',
        })
    })

    function setConfig(config: Record<string, unknown>): void {
        configContent = `${JSON.stringify(config, null, 2)}\n`
    }

    function createErrnoError(code: string): Error & { code: string } {
        const error = new Error(code) as Error & { code: string }
        error.code = code
        return error
    }
})
