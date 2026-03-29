import { acceptInvitation, markNotificationRead } from '../../lib/api/notifications.js'
import { formatError } from '../../lib/output.js'
import { resolveNotification } from './helpers.js'

export async function acceptNotification(idRef: string): Promise<void> {
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
