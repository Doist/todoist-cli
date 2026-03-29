import chalk from 'chalk'
import { fetchNotifications } from '../../lib/api/notifications.js'
import type { PaginatedViewOptions } from '../../lib/options.js'
import { formatError, formatPaginatedJson, formatPaginatedNdjson } from '../../lib/output.js'
import { formatNotificationDetails, formatRelativeTime, stripInvitationSecret } from './helpers.js'

type ListOptions = PaginatedViewOptions & {
    type?: string
    unread?: boolean
    read?: boolean
    offset?: string
}

export async function listNotifications(options: ListOptions): Promise<void> {
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
