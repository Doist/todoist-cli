import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./api/core.js', () => ({
    createApiForToken: vi.fn(),
}))

import { createMockApi } from '../test-support/mock-api.js'
import { createApiForToken } from './api/core.js'
import { createTodoistAuthProvider } from './auth-provider.js'

const mockCreateApiForToken = vi.mocked(createApiForToken)

const TEST_USER = {
    id: '12345',
    email: 'user@example.com',
    fullName: 'Test User',
}

function stubGetUser(user = TEST_USER) {
    const api = createMockApi({ getUser: vi.fn().mockResolvedValue(user) })
    mockCreateApiForToken.mockReturnValue(api)
    return api
}

describe('createTodoistAuthProvider', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('validateToken', () => {
        it('builds a read-write account when --read-only is not set', async () => {
            const api = stubGetUser()
            const provider = createTodoistAuthProvider()

            const account = await provider.validateToken({
                token: 'token_abc1234567',
                handshake: { readOnly: false, flags: {} },
            })

            expect(api.getUser).toHaveBeenCalled()
            expect(mockCreateApiForToken).toHaveBeenCalledWith('token_abc1234567')
            expect(account).toEqual({
                id: TEST_USER.id,
                email: TEST_USER.email,
                label: TEST_USER.email,
                auth_mode: 'read-write',
                auth_scope: 'data:read_write,data:delete,project:delete',
                auth_flags: undefined,
            })
        })

        it('builds a read-only account when --read-only is set', async () => {
            stubGetUser()
            const provider = createTodoistAuthProvider()

            const account = await provider.validateToken({
                token: 'token_abc1234567',
                handshake: { readOnly: true, flags: {} },
            })

            expect(account.auth_mode).toBe('read-only')
            expect(account.auth_scope).toBe('data:read')
            expect(account.auth_flags).toEqual(['read-only'])
        })

        it('persists --additional-scopes into auth_scope and auth_flags', async () => {
            stubGetUser()
            const provider = createTodoistAuthProvider()

            const account = await provider.validateToken({
                token: 'token_abc1234567',
                handshake: {
                    readOnly: false,
                    flags: { additionalScopes: 'backups,app-management' },
                },
            })

            // AUTH_FLAG_ORDER is ['read-only', 'app-management', 'backups'] so
            // parseScopesOption normalises the order regardless of CLI input.
            expect(account.auth_flags).toEqual(['app-management', 'backups'])
            expect(account.auth_scope).toBe(
                'data:read_write,data:delete,project:delete,dev:app_console,backups:read',
            )
            expect(account.auth_mode).toBe('read-write')
        })

        it('combines --read-only with --additional-scopes', async () => {
            stubGetUser()
            const provider = createTodoistAuthProvider()

            const account = await provider.validateToken({
                token: 'token_abc1234567',
                handshake: {
                    readOnly: true,
                    flags: { additionalScopes: 'backups' },
                },
            })

            expect(account.auth_mode).toBe('read-only')
            expect(account.auth_flags).toEqual(['read-only', 'backups'])
            expect(account.auth_scope).toBe('data:read,backups:read')
        })

        it('treats an empty additionalScopes flag as no additional scopes', async () => {
            stubGetUser()
            const provider = createTodoistAuthProvider()

            const account = await provider.validateToken({
                token: 'token_abc1234567',
                handshake: { readOnly: false, flags: { additionalScopes: '' } },
            })

            expect(account.auth_flags).toBeUndefined()
            expect(account.auth_scope).toBe('data:read_write,data:delete,project:delete')
        })

        it('throws on an unknown additional scope', async () => {
            stubGetUser()
            const provider = createTodoistAuthProvider()

            await expect(
                provider.validateToken({
                    token: 'token_abc1234567',
                    handshake: {
                        readOnly: false,
                        flags: { additionalScopes: 'not-a-real-scope' },
                    },
                }),
            ).rejects.toMatchObject({ code: 'INVALID_OPTIONS' })
        })
    })
})
