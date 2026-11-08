import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./api/core.js', () => ({
    getCurrentUserId: vi.fn().mockResolvedValue('user-me'),
}))

import { fixtures } from '../test-support/fixtures.js'
import { createMockApi, type MockApi } from '../test-support/mock-api.js'
import { resolveAssigneeIds } from './collaborators.js'

describe('resolveAssigneeIds', () => {
    let api: MockApi
    const sharedProject = { ...fixtures.projects.work, isShared: true }

    beforeEach(() => {
        api = createMockApi()
        api.getProjectCollaborators.mockResolvedValue({
            results: [
                { id: 'user-2', name: 'Alice Example', email: 'alice@example.com' },
                { id: 'user-3', name: 'Bob Example', email: 'bob@example.com' },
            ],
            nextCursor: null,
        })
    })

    it('resolves every reference, keyed in lower case, from one collaborator fetch', async () => {
        const ids = await resolveAssigneeIds(
            api,
            ['Alice Example', 'BOB@example.com', 'alice example'],
            sharedProject,
        )

        expect(ids).toEqual(
            new Map([
                ['alice example', 'user-2'],
                ['bob@example.com', 'user-3'],
            ]),
        )
        expect(api.getProjectCollaborators).toHaveBeenCalledTimes(1)
    })

    it('resolves me and id: references without fetching collaborators', async () => {
        const ids = await resolveAssigneeIds(api, ['me', 'id:user-9'], sharedProject)

        expect(ids).toEqual(
            new Map([
                ['me', 'user-me'],
                ['id:user-9', 'user-9'],
            ]),
        )
        expect(api.getProjectCollaborators).not.toHaveBeenCalled()
    })

    it('rejects a name that matches no collaborator', async () => {
        await expect(resolveAssigneeIds(api, ['Carol'], sharedProject)).rejects.toMatchObject({
            code: 'ASSIGNEE_NOT_FOUND',
            message: 'User "Carol" not found.',
        })
    })

    it('rejects a name in a project nobody else is in', async () => {
        await expect(
            resolveAssigneeIds(api, ['Alice Example'], fixtures.projects.work),
        ).rejects.toMatchObject({ code: 'NOT_SHARED' })
    })
})
