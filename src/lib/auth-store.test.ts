import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./auth.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./auth.js')>()
    return {
        ...actual,
        loadTokenForStoredUser: vi.fn(),
        upsertUser: vi.fn(),
        clearApiToken: vi.fn(),
        setDefaultUserId: vi.fn(),
    }
})

vi.mock('./config.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./config.js')>()
    return {
        ...actual,
        readConfig: vi.fn(),
    }
})

import {
    accountToUpsertInput,
    createTodoistTokenStore,
    type TodoistAccount,
    toTodoistAccount,
} from './auth-store.js'
import {
    clearApiToken,
    loadTokenForStoredUser,
    NoTokenError,
    setDefaultUserId,
    TOKEN_ENV_VAR,
    upsertUser,
} from './auth.js'
import { readConfig } from './config.js'
import { SecureStoreUnavailableError } from './secure-store.js'
import { UserNotFoundError } from './users.js'

const mockReadConfig = vi.mocked(readConfig)
const mockLoadToken = vi.mocked(loadTokenForStoredUser)
const mockUpsertUser = vi.mocked(upsertUser)
const mockClearApiToken = vi.mocked(clearApiToken)
const mockSetDefaultUserId = vi.mocked(setDefaultUserId)

const USER_A = {
    id: '111',
    email: 'a@example.com',
    auth_mode: 'read-write' as const,
    auth_scope: 'data:read_write,data:delete,project:delete',
}
const USER_B = {
    id: '222',
    email: 'b@example.com',
    auth_mode: 'read-only' as const,
    auth_scope: 'data:read',
    auth_flags: ['read-only' as const],
}

const ACCOUNT_A: TodoistAccount = {
    id: USER_A.id,
    email: USER_A.email,
    label: USER_A.email,
    auth_mode: USER_A.auth_mode,
    auth_scope: USER_A.auth_scope,
    auth_flags: undefined,
}

const ACCOUNT_B: TodoistAccount = {
    id: USER_B.id,
    email: USER_B.email,
    label: USER_B.email,
    auth_mode: USER_B.auth_mode,
    auth_scope: USER_B.auth_scope,
    auth_flags: ['read-only'],
}

describe('TodoistAccount mappers', () => {
    it('round-trips through toTodoistAccount → accountToUpsertInput', () => {
        const account = toTodoistAccount({
            id: USER_A.id,
            email: USER_A.email,
            authMode: USER_A.auth_mode,
            authScope: USER_A.auth_scope,
        })
        expect(account).toEqual(ACCOUNT_A)
        expect(accountToUpsertInput(account, 'token_xyz123456')).toEqual({
            id: USER_A.id,
            email: USER_A.email,
            token: 'token_xyz123456',
            authMode: USER_A.auth_mode,
            authScope: USER_A.auth_scope,
            authFlags: undefined,
        })
    })
})

describe('createTodoistTokenStore', () => {
    let originalEnvToken: string | undefined

    beforeEach(() => {
        vi.clearAllMocks()
        originalEnvToken = process.env[TOKEN_ENV_VAR]
        delete process.env[TOKEN_ENV_VAR]
    })

    afterEach(() => {
        if (originalEnvToken === undefined) {
            delete process.env[TOKEN_ENV_VAR]
        } else {
            process.env[TOKEN_ENV_VAR] = originalEnvToken
        }
    })

    describe('active()', () => {
        it('returns null when TODOIST_API_TOKEN is set (env tokens are not persisted)', async () => {
            process.env[TOKEN_ENV_VAR] = 'env_token_value'
            expect(await createTodoistTokenStore().active()).toBeNull()
            expect(mockReadConfig).not.toHaveBeenCalled()
        })

        it('returns null when no users are stored', async () => {
            mockReadConfig.mockResolvedValue({ users: [] })
            expect(await createTodoistTokenStore().active()).toBeNull()
        })

        it('returns the single stored user when no default is set', async () => {
            mockReadConfig.mockResolvedValue({ users: [USER_A] })
            mockLoadToken.mockResolvedValue({ token: 'tok_a', source: 'secure-store' })

            expect(await createTodoistTokenStore().active()).toEqual({
                token: 'tok_a',
                account: ACCOUNT_A,
            })
        })

        it('prefers the default user when multiple are stored', async () => {
            mockReadConfig.mockResolvedValue({
                users: [USER_A, USER_B],
                user: { defaultUser: USER_B.id },
            })
            mockLoadToken.mockResolvedValue({ token: 'tok_b', source: 'secure-store' })

            const result = await createTodoistTokenStore().active()
            expect(mockLoadToken).toHaveBeenCalledWith(USER_B)
            expect(result?.account.id).toBe(USER_B.id)
            expect(result?.account.auth_flags).toEqual(['read-only'])
        })

        it('returns null on multi-user-no-default (no selection error leaks out)', async () => {
            mockReadConfig.mockResolvedValue({ users: [USER_A, USER_B] })
            expect(await createTodoistTokenStore().active()).toBeNull()
            expect(mockLoadToken).not.toHaveBeenCalled()
        })

        it.each([
            ['NoTokenError', new NoTokenError()],
            ['SecureStoreUnavailableError', new SecureStoreUnavailableError('offline')],
        ])(
            'propagates %s when token load fails for a matched user (does not collapse to null)',
            async (_label, error) => {
                // Pre cli-core 0.12.0 these were swallowed to null, but `null`
                // is now reserved for "ref miss" — see TokenStore contract.
                mockReadConfig.mockResolvedValue({ users: [USER_A] })
                mockLoadToken.mockRejectedValue(error)
                await expect(createTodoistTokenStore().active()).rejects.toBe(error)
            },
        )

        describe('with --user ref', () => {
            it('returns the matched account when ref hits a stored id', async () => {
                mockReadConfig.mockResolvedValue({ users: [USER_A, USER_B] })
                mockLoadToken.mockResolvedValue({ token: 'tok_b', source: 'secure-store' })

                const result = await createTodoistTokenStore().active(USER_B.id)
                expect(mockLoadToken).toHaveBeenCalledWith(USER_B)
                expect(result?.account.id).toBe(USER_B.id)
            })

            it('returns the matched account when ref hits a stored email', async () => {
                mockReadConfig.mockResolvedValue({ users: [USER_A, USER_B] })
                mockLoadToken.mockResolvedValue({ token: 'tok_a', source: 'secure-store' })

                const result = await createTodoistTokenStore().active(USER_A.email)
                expect(mockLoadToken).toHaveBeenCalledWith(USER_A)
                expect(result?.account.email).toBe(USER_A.email)
            })

            it('returns null when ref does not match any stored account', async () => {
                mockReadConfig.mockResolvedValue({ users: [USER_A] })
                expect(await createTodoistTokenStore().active('nobody@example.com')).toBeNull()
                expect(mockLoadToken).not.toHaveBeenCalled()
            })

            it('propagates keyring errors when ref matches but token load fails', async () => {
                mockReadConfig.mockResolvedValue({ users: [USER_A, USER_B] })
                const error = new SecureStoreUnavailableError('offline')
                mockLoadToken.mockRejectedValue(error)
                await expect(createTodoistTokenStore().active(USER_B.id)).rejects.toBe(error)
            })
        })
    })

    describe('set()', () => {
        it('persists via upsertUser and exposes the storage result + warning', async () => {
            mockUpsertUser.mockResolvedValue({
                storage: 'config-file',
                replaced: false,
                warning:
                    'system credential manager unavailable; token saved as plaintext in /tmp/c.json',
            })

            const store = createTodoistTokenStore()
            await store.set(ACCOUNT_A, 'token_xyz123456')

            expect(mockUpsertUser).toHaveBeenCalledWith(
                accountToUpsertInput(ACCOUNT_A, 'token_xyz123456'),
            )
            expect(store.getLastStorageResult()).toEqual({
                storage: 'config-file',
                warning:
                    'system credential manager unavailable; token saved as plaintext in /tmp/c.json',
            })
        })
    })

    describe('clear()', () => {
        it('delegates to clearApiToken with no ref', async () => {
            mockClearApiToken.mockResolvedValue({ storage: 'secure-store' })
            await createTodoistTokenStore().clear()
            expect(mockClearApiToken).toHaveBeenCalledWith({ ref: undefined })
        })

        it('forwards a ref to clearApiToken', async () => {
            mockClearApiToken.mockResolvedValue({ storage: 'secure-store' })
            await createTodoistTokenStore().clear(USER_B.email)
            expect(mockClearApiToken).toHaveBeenCalledWith({ ref: USER_B.email })
        })
    })

    describe('list()', () => {
        it('returns an empty array when nothing is stored', async () => {
            mockReadConfig.mockResolvedValue({ users: [] })
            expect(await createTodoistTokenStore().list()).toEqual([])
        })

        it('marks the only stored user as the default (implicit single-user fallback)', async () => {
            mockReadConfig.mockResolvedValue({ users: [USER_A] })
            expect(await createTodoistTokenStore().list()).toEqual([
                { account: ACCOUNT_A, isDefault: true },
            ])
        })

        it('marks the explicit defaultUser when multiple are stored', async () => {
            mockReadConfig.mockResolvedValue({
                users: [USER_A, USER_B],
                user: { defaultUser: USER_B.id },
            })
            expect(await createTodoistTokenStore().list()).toEqual([
                { account: ACCOUNT_A, isDefault: false },
                { account: ACCOUNT_B, isDefault: true },
            ])
        })

        it('marks none as default when multiple users are stored without an explicit default', async () => {
            mockReadConfig.mockResolvedValue({ users: [USER_A, USER_B] })
            expect(await createTodoistTokenStore().list()).toEqual([
                { account: ACCOUNT_A, isDefault: false },
                { account: ACCOUNT_B, isDefault: false },
            ])
        })
    })

    describe('setDefault()', () => {
        it('delegates to setDefaultUserId', async () => {
            await createTodoistTokenStore().setDefault(USER_B.email)
            expect(mockSetDefaultUserId).toHaveBeenCalledWith(USER_B.email)
        })

        it('propagates UserNotFoundError when the ref does not match', async () => {
            const error = new UserNotFoundError('nobody@example.com')
            mockSetDefaultUserId.mockRejectedValueOnce(error)
            await expect(createTodoistTokenStore().setDefault('nobody@example.com')).rejects.toBe(
                error,
            )
        })
    })
})
