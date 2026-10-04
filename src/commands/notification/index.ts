import { Command } from 'commander'
import { failWithUsage } from '../../lib/missing-argument.js'
import { acceptNotification } from './accept.js'
import { listNotifications } from './list.js'
import { markRead } from './read.js'
import { rejectNotification } from './reject.js'
import { markUnread } from './unread.js'
import { viewNotification } from './view.js'

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
        .option('--ids-only', 'Output only IDs, one per line')
        .option('--full', 'Include all fields in JSON output')
        .action(listNotifications)

    notification
        .command('view [id]', { isDefault: true })
        .description('View notification details')
        .option('--json', 'Output as JSON')
        .action((id, options) => {
            if (!id) {
                failWithUsage(notification)
                return
            }
            return viewNotification(id, options)
        })

    const acceptCmd = notification
        .command('accept [id]')
        .description('Accept a share invitation')
        .action((id) => {
            if (!id) {
                failWithUsage(acceptCmd)
                return
            }
            return acceptNotification(id)
        })

    const rejectCmd = notification
        .command('reject [id]')
        .description('Reject a share invitation')
        .action((id) => {
            if (!id) {
                failWithUsage(rejectCmd)
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
                failWithUsage(unreadCmd)
                return
            }
            return markUnread(id)
        })
}
