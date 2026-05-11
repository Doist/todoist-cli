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

describe('toTodoistAccount', () => {
    it('builds the canonical account shape with label derived from email', () => {
        expect(
            toTodoistAccount({
                id: '12345',
                email: 'you@example.com',
                authMode: 'read-write',
                authScope: 'data:read_write,data:delete,project:delete',
                authFlags: undefined,
            }),
        ).toEqual({
            id: '12345',
            email: 'you@example.com',
            label: 'you@example.com',
            auth_mode: 'read-write',
            auth_scope: 'data:read_write,data:delete,project:delete',
            auth_flags: undefined,
        })
    })
})

describe('accountToUpsertInput', () => {
    it('inverts toTodoistAccount into the shape upsertUser expects', () => {
        expect(accountToUpsertInput(ACCOUNT_A, 'token_xyz123456')).toEqual({
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
            const store = createTodoistTokenStore()

            expect(await store.active()).toBeNull()
            expect(mockReadConfig).not.toHaveBeenCalled()
        })

        it('returns null when no users are stored', async () => {
            mockReadConfig.mockResolvedValue({ users: [] })
            const store = createTodoistTokenStore()

            expect(await store.active()).toBeNull()
        })

        it('returns the single stored user when no default is set', async () => {
            mockReadConfig.mockResolvedValue({ users: [USER_A] })
            mockLoadToken.mockResolvedValue({ token: 'tok_a', source: 'secure-store' })

            const store = createTodoistTokenStore()
            const result = await store.active()

            expect(result).toEqual({
                token: 'tok_a',
                account: {
                    id: USER_A.id,
                    email: USER_A.email,
                    label: USER_A.email,
                    auth_mode: 'read-write',
                    auth_scope: USER_A.auth_scope,
                    auth_flags: undefined,
                },
            })
        })

        it('prefers the default user when multiple are stored', async () => {
            mockReadConfig.mockResolvedValue({
                users: [USER_A, USER_B],
                user: { defaultUser: USER_B.id },
            })
            mockLoadToken.mockResolvedValue({ token: 'tok_b', source: 'secure-store' })

            const store = createTodoistTokenStore()
            const result = await store.active()

            expect(mockLoadToken).toHaveBeenCalledWith(USER_B)
            expect(result?.account.id).toBe(USER_B.id)
            expect(result?.account.auth_flags).toEqual(['read-only'])
        })

        it('returns null when multiple users are stored without a default (no selection error)', async () => {
            mockReadConfig.mockResolvedValue({ users: [USER_A, USER_B] })

            const store = createTodoistTokenStore()
            expect(await store.active()).toBeNull()
            expect(mockLoadToken).not.toHaveBeenCalled()
        })

        it('ignores the global --user selector (pure persisted-state view)', async () => {
            // Even though the global args layer might be carrying a --user ref,
            // active() must not consult it. Simulate by stubbing readConfig with
            // a single user and confirming we get *that* user back regardless.
            mockReadConfig.mockResolvedValue({ users: [USER_A] })
            mockLoadToken.mockResolvedValue({ token: 'tok_a', source: 'secure-store' })

            const store = createTodoistTokenStore()
            const result = await store.active()

            expect(result?.account.id).toBe(USER_A.id)
        })

        it('returns null when token load surfaces NoTokenError', async () => {
            mockReadConfig.mockResolvedValue({ users: [USER_A] })
            mockLoadToken.mockRejectedValue(new NoTokenError())

            const store = createTodoistTokenStore()
            expect(await store.active()).toBeNull()
        })

        it('returns null when the secure store is unavailable', async () => {
            mockReadConfig.mockResolvedValue({ users: [USER_A] })
            mockLoadToken.mockRejectedValue(new SecureStoreUnavailableError('offline'))

            const store = createTodoistTokenStore()
            expect(await store.active()).toBeNull()
        })

        it('propagates unexpected errors', async () => {
            mockReadConfig.mockResolvedValue({ users: [USER_A] })
            mockLoadToken.mockRejectedValue(new Error('boom'))

            const store = createTodoistTokenStore()
            await expect(store.active()).rejects.toThrow('boom')
        })
    })

    describe('set()', () => {
        it('persists the account via upsertUser and captures the storage result', async () => {
            mockUpsertUser.mockResolvedValue({ storage: 'secure-store', replaced: false })

            const store = createTodoistTokenStore()
            await store.set(ACCOUNT_A, 'token_xyz123456')

            expect(mockUpsertUser).toHaveBeenCalledWith({
                id: USER_A.id,
                email: USER_A.email,
                token: 'token_xyz123456',
                authMode: 'read-write',
                authScope: USER_A.auth_scope,
                authFlags: undefined,
            })
            expect(store.getLastStorageResult()).toEqual({ storage: 'secure-store' })
        })

        it('exposes the config-file fallback warning for the login command to surface', async () => {
            mockUpsertUser.mockResolvedValue({
                storage: 'config-file',
                replaced: false,
                warning:
                    'system credential manager unavailable; token saved as plaintext in /tmp/c.json',
            })

            const store = createTodoistTokenStore()
            await store.set(ACCOUNT_A, 'token_xyz123456')

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

            const store = createTodoistTokenStore()
            await store.clear()

            expect(mockClearApiToken).toHaveBeenCalled()
        })
    })
})
