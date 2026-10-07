import { acceptInvitation, markNotificationRead } from '../../lib/api/notifications.js'
import { CliError } from '../../lib/errors.js'
import { printDryRun } from '../../lib/output.js'
import { resolveNotification } from './helpers.js'

export async function acceptNotification(
    idRef: string,
    options: { dryRun?: boolean } = {},
): Promise<void> {
    const n = await resolveNotification(idRef)

    if (n.type !== 'share_invitation_sent') {
        throw new CliError(
            'INVALID_NOTIFICATION_TYPE',
            `Cannot accept: notification is ${n.type}, not a share invitation`,
        )
    }

    if (!n.invitationId || !n.invitationSecret) {
        throw new CliError('MISSING_INVITATION_DATA', 'Invitation data missing from notification')
    }

    if (options.dryRun) {
        printDryRun('accept invitation', {
            Notification: n.id,
            Project: n.project?.name,
            From: n.fromUser?.name,
        })
        return
    }

    await acceptInvitation(n.invitationId, n.invitationSecret)
    await markNotificationRead(n.id)

    console.log(
        `Accepted invitation to "${n.project?.name ?? 'project'}" from ${n.fromUser?.name ?? 'unknown'}.`,
    )
}
