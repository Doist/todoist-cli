import { createCommand, type LiveNotification } from '@doist/todoist-api-typescript'
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
    createdAt: string
    fromUser?: NotificationUser
    project?: NotificationProject
    task?: NotificationTask
    invitationId?: string
    invitationSecret?: string
}

function parseNotification(n: LiveNotification): Notification {
    // The SDK type uses passthrough() so extra fields are preserved
    const raw = n as Record<string, unknown>

    let fromUser: NotificationUser | undefined
    if (n.fromUid) {
        const fromUserData = raw.from_user as Record<string, unknown> | undefined
        fromUser = {
            id: String(n.fromUid),
            name: String(fromUserData?.full_name ?? fromUserData?.name ?? ''),
            email: String(fromUserData?.email ?? ''),
        }
    }

    let project: NotificationProject | undefined
    if (n.projectId) {
        project = {
            id: String(n.projectId),
            name: String(raw.project_name ?? ''),
        }
    }

    let task: NotificationTask | undefined
    if (n.itemId) {
        task = {
            id: String(n.itemId),
            content: String(n.itemContent ?? ''),
        }
    }

    return {
        id: String(n.id),
        type: n.notificationType as NotificationType,
        isUnread: n.isUnread,
        isDeleted: Boolean(raw.is_deleted ?? false),
        createdAt: n.createdAt,
        fromUser,
        project,
        task,
        invitationId: n.invitationId ? String(n.invitationId) : undefined,
        invitationSecret: raw.invitation_secret ? String(raw.invitation_secret) : undefined,
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
