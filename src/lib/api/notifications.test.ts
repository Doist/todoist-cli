import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./core.js', () => ({
    getApi: vi.fn(),
}))

import type { LiveNotification } from '@doist/todoist-sdk'
import { setupApiMock } from '../../test-support/api-mock.js'
import type { MockApi } from '../../test-support/mock-api.js'
import { fetchNotifications } from './notifications.js'

describe('fetchNotifications', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('maps SDK notification fields, filters deleted entries, and sorts newest first', async () => {
        const notifications: LiveNotification[] = [
            {
                id: 'older',
                createdAt: new Date('2026-08-17T10:00:00Z'),
                fromUid: 'user-1',
                notificationType: 'item_assigned',
                isUnread: false,
                projectId: 'project-1',
                projectName: 'Work',
                itemId: 'task-1',
                itemContent: 'Review the proposal',
            },
            {
                id: 'newer',
                createdAt: new Date('2026-08-18T10:00:00Z'),
                notificationType: 'share_invitation_sent',
                isUnread: true,
                fromUser: {
                    id: 'user-2',
                    fullName: 'Jane Doe',
                    email: 'jane@example.com',
                    imageId: null,
                },
                projectId: 'project-2',
                projectName: 'Shared project',
                invitationId: 'invitation-1',
                invitationSecret: 'secret-1',
            },
            {
                id: 'deleted',
                createdAt: new Date('2026-08-19T10:00:00Z'),
                fromUid: 'user-3',
                notificationType: 'project_archived',
                isUnread: true,
                isDeleted: true,
            },
        ]
        mockApi.sync.mockResolvedValue({ liveNotifications: notifications })

        await expect(fetchNotifications()).resolves.toStrictEqual([
            {
                id: 'newer',
                type: 'share_invitation_sent',
                isUnread: true,
                isDeleted: false,
                createdAt: new Date('2026-08-18T10:00:00Z'),
                fromUser: {
                    id: 'user-2',
                    name: 'Jane Doe',
                    email: 'jane@example.com',
                },
                project: { id: 'project-2', name: 'Shared project' },
                task: undefined,
                invitationId: 'invitation-1',
                invitationSecret: 'secret-1',
            },
            {
                id: 'older',
                type: 'item_assigned',
                isUnread: false,
                isDeleted: false,
                createdAt: new Date('2026-08-17T10:00:00Z'),
                fromUser: { id: 'user-1', name: '', email: '' },
                project: { id: 'project-1', name: 'Work' },
                task: { id: 'task-1', content: 'Review the proposal' },
                invitationId: undefined,
                invitationSecret: undefined,
            },
        ])
        expect(mockApi.sync).toHaveBeenCalledWith({
            resourceTypes: ['live_notifications'],
            syncToken: '*',
        })
    })
})
