import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./core.js', () => ({ getApi: vi.fn() }))

import { getApi } from './core.js'
import { fetchUserStatus, writeUserStatus } from './user-status.js'

const sync = vi.fn()

describe('user status API', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(getApi).mockResolvedValue({ sync } as never)
    })

    it('reads the status from the Sync user resource', async () => {
        sync.mockResolvedValue({ user: { status: { message: 'Away', effects: {} } } })
        expect(await fetchUserStatus()).toEqual({ message: 'Away', effects: {} })
        expect(sync).toHaveBeenCalledWith({ resourceTypes: ['user'], syncToken: '*' })
    })

    it('reads null when the user has no status', async () => {
        sync.mockResolvedValue({ user: { status: null } })
        expect(await fetchUserStatus()).toBeNull()
    })

    it('replaces the status with one user_update and reads the result back in the same request', async () => {
        sync.mockResolvedValue({ user: { status: { message: 'Away', effects: {} } } })
        const status = await writeUserStatus({ message: 'Away' })
        expect(status).toEqual({ message: 'Away', effects: {} })

        const request = sync.mock.calls[0][0]
        expect(request.commands).toHaveLength(1)
        expect(request.commands[0]).toMatchObject({
            type: 'user_update',
            args: { status: { message: 'Away' } },
        })
        expect(request.resourceTypes).toEqual(['user'])
        expect(request.syncToken).toBe('*')
    })

    it('clears with status: null, which is not the same as omitting it', async () => {
        sync.mockResolvedValue({ user: { status: null } })
        expect(await writeUserStatus(null)).toBeNull()
        expect(sync.mock.calls[0][0].commands[0].args).toStrictEqual({ status: null })
    })

    it.each([
        ['reads', () => fetchUserStatus()],
        ['writes', () => writeUserStatus(null)],
    ])('refuses to guess when the response %s without a user', async (_name, call) => {
        sync.mockResolvedValue({})
        await expect(call()).rejects.toMatchObject({ code: 'API_ERROR' })
    })
})
