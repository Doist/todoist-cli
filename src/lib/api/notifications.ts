import { getApiToken } from '../auth.js'
import { verboseFetch } from '../logger.js'
import { executeSyncCommand, generateUuid, type SyncCommand } from './core.js'

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

function parseNotification(n: Record<string, unknown>): Notification {
    let fromUser: NotificationUser | undefined
    if (n.from_uid) {
        const fromUserData = n.from_user as Record<string, unknown> | undefined
        fromUser = {
            id: String(n.from_uid),
            name: String(fromUserData?.full_name ?? fromUserData?.name ?? ''),
            email: String(fromUserData?.email ?? ''),
        }
    }

    let project: NotificationProject | undefined
    if (n.project_id) {
        project = {
            id: String(n.project_id),
            name: String(n.project_name ?? ''),
        }
    }

    let task: NotificationTask | undefined
    if (n.item_id) {
        task = {
            id: String(n.item_id),
            content: String(n.item_content ?? ''),
        }
    }

    return {
        id: String(n.id),
        type: (n.notification_type ?? n.type) as NotificationType,
        isUnread: Boolean(n.is_unread),
        isDeleted: Boolean(n.is_deleted),
        createdAt: String(n.created_at ?? n.created ?? ''),
        fromUser,
        project,
        task,
        invitationId: n.invitation_id ? String(n.invitation_id) : undefined,
        invitationSecret: n.invitation_secret ? String(n.invitation_secret) : undefined,
    }
}

interface NotificationFetchResponse {
    live_notifications?: Array<Record<string, unknown>>
    live_notifications_last_read_id?: number
    error?: string
}

export async function fetchNotifications(): Promise<Notification[]> {
    const token = await getApiToken()
    const response = await verboseFetch('https://api.todoist.com/api/v1/sync', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            sync_token: '*',
            resource_types: '["live_notifications"]',
        }),
    })

    if (!response.ok) {
        throw new Error(`Failed to fetch notifications: ${response.status}`)
    }

    const data: NotificationFetchResponse = await response.json()
    if (data.error) {
        throw new Error(`Notifications API error: ${data.error}`)
    }

    const notifications = (data.live_notifications ?? [])
        .map(parseNotification)
        .filter((n: Notification) => !n.isDeleted)

    notifications.sort(
        (a: Notification, b: Notification) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )

    return notifications
}

export async function markNotificationRead(id: string): Promise<void> {
    const command: SyncCommand = {
        type: 'live_notifications_mark_read',
        uuid: generateUuid(),
        args: { ids: [id] },
    }
    await executeSyncCommand([command])
}

export async function markNotificationUnread(id: string): Promise<void> {
    const command: SyncCommand = {
        type: 'live_notifications_mark_unread',
        uuid: generateUuid(),
        args: { ids: [id] },
    }
    await executeSyncCommand([command])
}

export async function markAllNotificationsRead(): Promise<void> {
    const command: SyncCommand = {
        type: 'live_notifications_mark_read_all',
        uuid: generateUuid(),
        args: {},
    }
    await executeSyncCommand([command])
}

export async function acceptInvitation(invitationId: string, secret: string): Promise<void> {
    const command: SyncCommand = {
        type: 'accept_invitation',
        uuid: generateUuid(),
        args: {
            invitation_id: Number(invitationId),
            invitation_secret: secret,
        },
    }
    await executeSyncCommand([command])
}

export async function rejectInvitation(invitationId: string, secret: string): Promise<void> {
    const command: SyncCommand = {
        type: 'reject_invitation',
        uuid: generateUuid(),
        args: {
            invitation_id: Number(invitationId),
            invitation_secret: secret,
        },
    }
    await executeSyncCommand([command])
}
