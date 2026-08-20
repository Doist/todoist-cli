import { createCommand, type LiveNotification } from '@doist/todoist-sdk'
import { getApi } from './core.js'

export type NotificationType =
    | 'share_invitation_sent'
    | 'share_invitation_accepted'
    | 'share_invitation_rejected'
    | 'user_left_project'
    | 'user_removed_from_project'
    | 'item_assigned'
    | 'item_completed'
    | 'item_uncompleted'
    | 'note_added'
    | 'project_archived'
    | 'project_unarchived'
    | 'karma_daily_goal'
    | 'karma_weekly_goal'
    | 'biz_trial_will_end'
    | 'biz_payment_failed'
    | 'biz_account_disabled'
    | string

export interface NotificationUser {
    id: string
    name: string
    email: string
}

export interface NotificationProject {
    id: string
    name: string
}

export interface NotificationTask {
    id: string
    content: string
}

export interface Notification {
    id: string
    type: NotificationType
    isUnread: boolean
    isDeleted: boolean
    createdAt: Date
    fromUser?: NotificationUser
    project?: NotificationProject
    task?: NotificationTask
    invitationId?: string
    invitationSecret?: string
}

function parseNotification(n: LiveNotification): Notification {
    let fromUser: NotificationUser | undefined
    const fromUserId = n.fromUser?.id ?? n.fromUid
    if (fromUserId) {
        fromUser = {
            id: fromUserId,
            name: n.fromUser?.fullName ?? '',
            email: n.fromUser?.email ?? '',
        }
    }

    let project: NotificationProject | undefined
    if (n.projectId) {
        project = {
            id: n.projectId,
            name: n.projectName ?? '',
        }
    }

    let task: NotificationTask | undefined
    if (n.itemId) {
        task = {
            id: n.itemId,
            content: n.itemContent ?? '',
        }
    }

    return {
        id: n.id,
        type: n.notificationType as NotificationType,
        isUnread: n.isUnread,
        isDeleted: n.isDeleted ?? false,
        createdAt: n.createdAt,
        fromUser,
        project,
        task,
        invitationId: n.invitationId,
        invitationSecret: n.invitationSecret,
    }
}

export async function fetchNotifications(): Promise<Notification[]> {
    const api = await getApi()
    const response = await api.sync({
        resourceTypes: ['live_notifications'],
        syncToken: '*',
    })

    const notifications = (response.liveNotifications ?? [])
        .map(parseNotification)
        .filter((n: Notification) => !n.isDeleted)

    notifications.sort(
        (a: Notification, b: Notification) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )

    return notifications
}

export async function markNotificationRead(id: string): Promise<void> {
    const api = await getApi()
    await api.sync({
        commands: [createCommand('live_notifications_mark_read', { ids: [id] })],
    })
}

export async function markNotificationUnread(id: string): Promise<void> {
    const api = await getApi()
    await api.sync({
        commands: [createCommand('live_notifications_mark_unread', { ids: [id] })],
    })
}

export async function markAllNotificationsRead(): Promise<void> {
    const api = await getApi()
    await api.sync({
        commands: [createCommand('live_notifications_mark_read_all', {} as Record<never, never>)],
    })
}

export async function acceptInvitation(invitationId: string, secret: string): Promise<void> {
    const api = await getApi()
    await api.sync({
        commands: [
            createCommand('accept_invitation', {
                invitationId,
                invitationSecret: secret,
            }),
        ],
    })
}

export async function rejectInvitation(invitationId: string, secret: string): Promise<void> {
    const api = await getApi()
    await api.sync({
        commands: [
            createCommand('reject_invitation', {
                invitationId,
                invitationSecret: secret,
            }),
        ],
    })
}
