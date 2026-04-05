import { fetchNotifications, type Notification } from '../../lib/api/notifications.js'
import { CliError } from '../../lib/errors.js'
import { extractId, isIdRef } from '../../lib/refs.js'

export function formatRelativeTime(dateStr: string): string {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    const diffHour = Math.floor(diffMs / 3600000)
    const diffDay = Math.floor(diffMs / 86400000)

    if (diffMin < 1) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    if (diffHour < 24) return `${diffHour}h ago`
    if (diffDay < 7) return `${diffDay}d ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatNotificationDetails(n: Notification): string {
    switch (n.type) {
        case 'share_invitation_sent':
            return `${n.fromUser?.name || 'Someone'} invited you to "${n.project?.name || 'a project'}"`
        case 'share_invitation_accepted':
            return `${n.fromUser?.name || 'Someone'} accepted your invite to "${n.project?.name || 'a project'}"`
        case 'share_invitation_rejected':
            return `${n.fromUser?.name || 'Someone'} rejected your invite to "${n.project?.name || 'a project'}"`
        case 'user_left_project':
            return `${n.fromUser?.name || 'Someone'} left "${n.project?.name || 'a project'}"`
        case 'user_removed_from_project':
            return `You were removed from "${n.project?.name || 'a project'}"`
        case 'item_assigned':
            return `"${n.task?.content || 'A task'}" assigned to you${n.project?.name ? ` in ${n.project.name}` : ''}`
        case 'item_completed':
            return `"${n.task?.content || 'A task'}" was completed`
        case 'item_uncompleted':
            return `"${n.task?.content || 'A task'}" was uncompleted`
        case 'note_added':
            return `Comment on "${n.task?.content || 'a task'}"${n.fromUser?.name ? ` by ${n.fromUser.name}` : ''}`
        case 'project_archived':
            return `"${n.project?.name || 'A project'}" was archived`
        case 'project_unarchived':
            return `"${n.project?.name || 'A project'}" was unarchived`
        case 'karma_daily_goal':
            return 'Daily karma goal reached'
        case 'karma_weekly_goal':
            return 'Weekly karma goal reached'
        case 'biz_trial_will_end':
            return 'Business trial ending soon'
        case 'biz_payment_failed':
            return 'Payment failed'
        case 'biz_account_disabled':
            return 'Account disabled'
        default:
            return n.type
    }
}

export function stripInvitationSecret(n: Notification): Omit<Notification, 'invitationSecret'> {
    const { invitationSecret: _, ...rest } = n
    return rest
}

export async function resolveNotification(idRef: string): Promise<Notification> {
    const notifications = await fetchNotifications()

    let id: string
    if (isIdRef(idRef)) {
        id = extractId(idRef)
    } else {
        id = idRef
    }

    const notification = notifications.find((n) => n.id === id)
    if (!notification) {
        throw new CliError('NOTIFICATION_NOT_FOUND', `Notification not found: ${idRef}`)
    }

    return notification
}
