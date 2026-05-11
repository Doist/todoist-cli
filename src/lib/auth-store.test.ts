import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./auth.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./auth.js')>()
    return {
        ...actual,
        loadTokenForStoredUser: vi.fn(),
        upsertUser: vi.fn(),
        clearApiToken: vi.fn(),
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
    TOKEN_ENV_VAR,
    upsertUser,
} from './auth.js'
import { readConfig } from './config.js'
import { SecureStoreUnavailableError } from './secure-store.js'

const mockReadConfig = vi.mocked(readConfig)
const mockLoadToken = vi.mocked(loadTokenForStoredUser)
const mockUpsertUser = vi.mocked(upsertUser)
const mockClearApiToken = vi.mocked(clearApiToken)

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
        ])('returns null when token load throws %s', async (_label, error) => {
            mockReadConfig.mockResolvedValue({ users: [USER_A] })
            mockLoadToken.mockRejectedValue(error)
            expect(await createTodoistTokenStore().active()).toBeNull()
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
        it('delegates to clearApiToken', async () => {
            mockClearApiToken.mockResolvedValue({ storage: 'secure-store' })
            await createTodoistTokenStore().clear()
            expect(mockClearApiToken).toHaveBeenCalled()
        })
    })
})
