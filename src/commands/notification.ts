import chalk from 'chalk'
import { Command } from 'commander'
import {
    acceptInvitation,
    fetchNotifications,
    markAllNotificationsRead,
    markNotificationRead,
    markNotificationUnread,
    type Notification,
    rejectInvitation,
} from '../lib/api/notifications.js'
import type { PaginatedViewOptions, ViewOptions } from '../lib/options.js'
import { formatError, formatPaginatedJson, formatPaginatedNdjson } from '../lib/output.js'
import { extractId, isIdRef } from '../lib/refs.js'

function formatRelativeTime(dateStr: string): string {
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

function formatNotificationDetails(n: Notification): string {
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

function stripInvitationSecret(n: Notification): Omit<Notification, 'invitationSecret'> {
    const { invitationSecret: _, ...rest } = n
    return rest
}

type ListOptions = PaginatedViewOptions & {
    type?: string
    unread?: boolean
    read?: boolean
    offset?: string
}

async function listNotifications(options: ListOptions): Promise<void> {
    if (options.unread && options.read) {
        throw new Error(formatError('INVALID_OPTIONS', 'Cannot specify both --read and --unread'))
    }

    // Note: All filtering (type, read state, pagination) is done client-side because
    // the Todoist Sync API v9 live_notifications endpoint doesn't support server-side
    // filtering or pagination - it returns all notifications in a single response.
    let notifications = await fetchNotifications()

    if (options.type) {
        const types = options.type.split(',').map((t) => t.trim())
        notifications = notifications.filter((n) => types.includes(n.type))
    }

    if (options.unread) {
        notifications = notifications.filter((n) => n.isUnread)
    } else if (options.read) {
        notifications = notifications.filter((n) => !n.isUnread)
    }

    const totalCount = notifications.length
    const offset = options.offset ? parseInt(options.offset, 10) : 0
    const limit = options.limit ? parseInt(options.limit, 10) : 10
    const hasMore = totalCount > offset + limit
    notifications = notifications.slice(offset, offset + limit)

    const sanitized = notifications.map(stripInvitationSecret)

    if (options.json) {
        console.log(
            formatPaginatedJson(
                { results: sanitized, nextCursor: null },
                'notification',
                options.full,
                false,
            ),
        )
        return
    }

    if (options.ndjson) {
        console.log(
            formatPaginatedNdjson(
                { results: sanitized, nextCursor: null },
                'notification',
                options.full,
                false,
            ),
        )
        return
    }

    if (notifications.length === 0) {
        console.log('No notifications.')
        return
    }

    const blocks = notifications.map((n) => {
        const unreadMarker = n.isUnread ? chalk.bold('●') : ' '
        const details = formatNotificationDetails(n)
        const line1 = n.isUnread
            ? `${unreadMarker} ${chalk.bold(details)}`
            : `${unreadMarker} ${details}`

        const metaParts = [
            chalk.dim(`id:${n.id}`),
            chalk.cyan(n.type),
            chalk.dim(formatRelativeTime(n.createdAt)),
        ]
        const line2 = `  ${metaParts.join('  ')}`

        return `${line1}\n${line2}`
    })

    console.log(blocks.join('\n\n'))

    if (hasMore) {
        const nextOffset = offset + limit
        console.log(
            chalk.dim(
                `\n... showing ${offset + 1}-${offset + notifications.length} of ${totalCount}. Use --offset ${nextOffset} to see more.`,
            ),
        )
    }
}

async function resolveNotification(idRef: string): Promise<Notification> {
    const notifications = await fetchNotifications()

    let id: string
    if (isIdRef(idRef)) {
        id = extractId(idRef)
    } else {
        id = idRef
    }

    const notification = notifications.find((n) => n.id === id)
    if (!notification) {
        throw new Error(formatError('NOTIFICATION_NOT_FOUND', `Notification not found: ${idRef}`))
    }

    return notification
}

async function viewNotification(idRef: string, options: ViewOptions): Promise<void> {
    const n = await resolveNotification(idRef)

    if (options.json) {
        console.log(JSON.stringify(stripInvitationSecret(n), null, 2))
        return
    }

    console.log(`Type:       ${n.type}`)
    if (n.fromUser?.name || n.fromUser?.email) {
        const fromParts = [n.fromUser.name, n.fromUser.email].filter(Boolean)
        console.log(`From:       ${fromParts.join(' - ')}`)
    }
    if (n.project?.name) {
        console.log(`Project:    ${n.project.name}`)
    }
    if (n.task?.content) {
        console.log(`Task:       ${n.task.content}`)
    }
    const date = new Date(n.createdAt)
    console.log(`Received:   ${formatRelativeTime(n.createdAt)} (${date.toLocaleString()})`)
    console.log(`Status:     ${n.isUnread ? 'Unread' : 'Read'}`)

    console.log('')
    console.log(formatNotificationDetails(n))

    if (n.type === 'share_invitation_sent') {
        console.log('')
        console.log('Actions:')
        console.log(`  td notification accept id:${n.id}`)
        console.log(`  td notification reject id:${n.id}`)
    }
}

async function acceptNotification(idRef: string): Promise<void> {
    const n = await resolveNotification(idRef)

    if (n.type !== 'share_invitation_sent') {
        throw new Error(
            formatError(
                'INVALID_NOTIFICATION_TYPE',
                `Cannot accept: notification is ${n.type}, not a share invitation`,
            ),
        )
    }

    if (!n.invitationId || !n.invitationSecret) {
        throw new Error(
            formatError('MISSING_INVITATION_DATA', 'Invitation data missing from notification'),
        )
    }

    await acceptInvitation(n.invitationId, n.invitationSecret)
    await markNotificationRead(n.id)

    console.log(
        `Accepted invitation to "${n.project?.name ?? 'project'}" from ${n.fromUser?.name ?? 'unknown'}.`,
    )
}

async function rejectNotification(idRef: string): Promise<void> {
    const n = await resolveNotification(idRef)

    if (n.type !== 'share_invitation_sent') {
        throw new Error(
            formatError(
                'INVALID_NOTIFICATION_TYPE',
                `Cannot reject: notification is ${n.type}, not a share invitation`,
            ),
        )
    }

    if (!n.invitationId || !n.invitationSecret) {
        throw new Error(
            formatError('MISSING_INVITATION_DATA', 'Invitation data missing from notification'),
        )
    }

    await rejectInvitation(n.invitationId, n.invitationSecret)
    await markNotificationRead(n.id)

    console.log(
        `Rejected invitation to "${n.project?.name ?? 'project'}" from ${n.fromUser?.name ?? 'unknown'}.`,
    )
}

interface ReadOptions {
    all?: boolean
    yes?: boolean
}

async function markRead(idRef: string | undefined, options: ReadOptions): Promise<void> {
    if (options.all) {
        if (!options.yes) {
            console.log('Use --all --yes to mark all notifications as read.')
            return
        }
        const notifications = await fetchNotifications()
        const unreadCount = notifications.filter((n) => n.isUnread).length
        await markAllNotificationsRead()
        console.log(`Marked ${unreadCount} notification${unreadCount === 1 ? '' : 's'} as read.`)
        return
    }

    if (!idRef) {
        throw new Error(formatError('MISSING_ID', 'Provide a notification ID or use --all'))
    }

    const n = await resolveNotification(idRef)
    await markNotificationRead(n.id)
    console.log('Marked as read.')
}

async function markUnread(idRef: string): Promise<void> {
    const n = await resolveNotification(idRef)
    await markNotificationUnread(n.id)
    console.log('Marked as unread.')
}

export function registerNotificationCommand(program: Command): void {
    const notification = program.command('notification').description('Manage notifications')

    notification
        .command('list')
        .description('List notifications')
        .option('--type <types>', 'Filter by type (comma-separated)')
        .option('--unread', 'Only show unread notifications')
        .option('--read', 'Only show read notifications')
        .option('--limit <n>', 'Max notifications to show (default: 10)')
        .option('--offset <n>', 'Skip first N notifications')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .action(listNotifications)

    notification
        .command('view [id]', { isDefault: true })
        .description('View notification details')
        .option('--json', 'Output as JSON')
        .action((id, options) => {
            if (!id) {
                notification.help()
                return
            }
            return viewNotification(id, options)
        })

    const acceptCmd = notification
        .command('accept [id]')
        .description('Accept a share invitation')
        .action((id) => {
            if (!id) {
                acceptCmd.help()
                return
            }
            return acceptNotification(id)
        })

    const rejectCmd = notification
        .command('reject [id]')
        .description('Reject a share invitation')
        .action((id) => {
            if (!id) {
                rejectCmd.help()
                return
            }
            return rejectNotification(id)
        })

    notification
        .command('read [id]')
        .description('Mark notification(s) as read')
        .option('--all', 'Mark all notifications as read')
        .option('--yes', 'Confirm marking all as read')
        .action((id, options) => markRead(id, options))

    const unreadCmd = notification
        .command('unread [id]')
        .description('Mark notification as unread')
        .action((id) => {
            if (!id) {
                unreadCmd.help()
                return
            }
            return markUnread(id)
        })
}
