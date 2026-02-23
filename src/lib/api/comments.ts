import { executeSyncCommand, generateUuid, type SyncCommand } from './core.js'

export interface AddCommentViaSyncArgs {
    taskId?: string
    projectId?: string
    content: string
    uidsToNotify?: string[]
}

/**
 * Add a comment via the Sync API so we can pass uids_to_notify.
 *
 * NOTE:
 * - This intentionally supports only basic text comments (no attachments).
 * - Command types/args are based on the Todoist Sync API conventions.
 */
export async function addCommentViaSync(args: AddCommentViaSyncArgs): Promise<string> {
    if (!args.taskId && !args.projectId) {
        throw new Error('addCommentViaSync requires taskId or projectId')
    }

    const tempId = generateUuid()

    const command: SyncCommand = {
        type: 'note_add',
        uuid: generateUuid(),
        temp_id: tempId,
        args: {
            ...(args.taskId && { item_id: args.taskId }),
            ...(args.projectId && { project_id: args.projectId }),
            content: args.content,
            ...(args.uidsToNotify && args.uidsToNotify.length > 0
                ? { uids_to_notify: args.uidsToNotify }
                : {}),
        },
    }

    const result = await executeSyncCommand([command])
    return result.temp_id_mapping?.[tempId] ?? tempId
}
