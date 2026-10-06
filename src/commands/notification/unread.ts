import { markNotificationUnread } from '../../lib/api/notifications.js'
import { printDryRun } from '../../lib/output.js'
import { resolveNotification } from './helpers.js'

export async function markUnread(idRef: string, options: { dryRun?: boolean } = {}): Promise<void> {
    const n = await resolveNotification(idRef)
    if (options.dryRun) {
        printDryRun('mark notification as unread', { Notification: n.id })
        return
    }
    await markNotificationUnread(n.id)
    console.log('Marked as unread.')
}
