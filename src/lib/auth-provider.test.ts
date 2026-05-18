import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./api/core.js', () => ({
    createApiForToken: vi.fn(),
}))

import { createMockApi } from '../test-support/mock-api.js'
import { createApiForToken } from './api/core.js'
import { createTodoistAuthProvider } from './auth-provider.js'

const mockCreateApiForToken = vi.mocked(createApiForToken)

const TEST_USER = { id: '12345', email: 'user@example.com', fullName: 'Test User' }

function stubGetUser() {
    const api = createMockApi({ getUser: vi.fn().mockResolvedValue(TEST_USER) })
    mockCreateApiForToken.mockReturnValue(api)
    return api
}

describe('createTodoistAuthProvider.validateToken', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('probes the token and builds a read-write account', async () => {
        const api = stubGetUser()
        const account = await createTodoistAuthProvider().validateToken({
            token: 'token_abc1234567',
            handshake: { readOnly: false, flags: {} },
        })

        expect(mockCreateApiForToken).toHaveBeenCalledWith('token_abc1234567')
        expect(api.getUser).toHaveBeenCalled()
        expect(account).toEqual({
            id: TEST_USER.id,
            email: TEST_USER.email,
            label: TEST_USER.email,
            auth_mode: 'read-write',
            auth_scope: 'data:read_write,data:delete,project:delete',
            auth_flags: undefined,
        })
    })

    it('combines --read-only with --additional-scopes into auth_mode/scope/flags', async () => {
        stubGetUser()
        const account = await createTodoistAuthProvider().validateToken({
            token: 'token_abc1234567',
            handshake: { readOnly: true, flags: { additionalScopes: 'backups,app-management' } },
        })

        // AUTH_FLAG_ORDER normalises ordering regardless of CLI input.
        expect(account.auth_mode).toBe('read-only')
        expect(account.auth_flags).toEqual(['read-only', 'app-management', 'backups'])
        expect(account.auth_scope).toBe('data:read,dev:app_console,backups:read')
    })
})
