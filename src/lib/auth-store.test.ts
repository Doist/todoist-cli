/**
 * Unit tests for the todoist-cli-specific overlay in `createTodoistTokenStore`.
 * The keyring mechanics live in cli-core; here we only verify the env-var
 * short-circuit that `active()` and `activeBundle()` add on top of the inner
 * store, so a regression in either read path is caught locally.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const innerActive = vi.fn()
const innerActiveBundle = vi.fn()

vi.mock('@doist/cli-core/auth', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@doist/cli-core/auth')>()
    return {
        ...actual,
        createKeyringTokenStore: () => ({
            active: innerActive,
            activeBundle: innerActiveBundle,
            set: vi.fn(),
            setBundle: vi.fn(),
            clear: vi.fn(),
            list: vi.fn(),
            setDefault: vi.fn(),
            getLastStorageResult: vi.fn(),
            getLastClearResult: vi.fn(),
        }),
    }
})

const { createTodoistTokenStore, TOKEN_ENV_VAR } = await import('./auth-store.js')

describe('createTodoistTokenStore env-var short-circuit', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        delete process.env[TOKEN_ENV_VAR]
    })

    afterEach(() => {
        delete process.env[TOKEN_ENV_VAR]
    })

    it('active() returns null without touching the inner store when the env token is set', async () => {
        process.env[TOKEN_ENV_VAR] = 'env-token'
        const store = createTodoistTokenStore()

        await expect(store.active()).resolves.toBeNull()
        expect(innerActive).not.toHaveBeenCalled()
    })

    it('activeBundle() returns null without touching the inner store when the env token is set', async () => {
        process.env[TOKEN_ENV_VAR] = 'env-token'
        const store = createTodoistTokenStore()

        await expect(store.activeBundle()).resolves.toBeNull()
        expect(innerActiveBundle).not.toHaveBeenCalled()
    })

    it('activeBundle() delegates to the inner store when no env token is set', async () => {
        const snapshot = { account: { id: '1', label: 'a' }, bundle: { accessToken: 't' } }
        innerActiveBundle.mockResolvedValue(snapshot)
        const store = createTodoistTokenStore()

        await expect(store.activeBundle('ref')).resolves.toBe(snapshot)
        expect(innerActiveBundle).toHaveBeenCalledWith('ref')
    })
})
