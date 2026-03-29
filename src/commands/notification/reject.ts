import { markNotificationRead, rejectInvitation } from '../../lib/api/notifications.js'
import { formatError } from '../../lib/output.js'
import { resolveNotification } from './helpers.js'

export async function rejectNotification(idRef: string): Promise<void> {
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
