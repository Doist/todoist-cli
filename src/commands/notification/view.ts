import type { ViewOptions } from '../../lib/options.js'
import {
    formatNotificationDetails,
    formatRelativeTime,
    resolveNotification,
    stripInvitationSecret,
} from './helpers.js'

export async function viewNotification(idRef: string, options: ViewOptions): Promise<void> {
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
