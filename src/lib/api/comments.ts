import { getApiToken } from '../auth.js'

export interface CreateCommentV1Args {
    taskId?: string
    projectId?: string
    content: string
    attachment?: unknown
    uidsToNotify?: string[]
}

export interface CommentV1Response {
    id: string
    posted_uid: string
    content: string
    file_attachment: unknown
    uids_to_notify: string[] | null
    is_deleted: boolean
    posted_at: string
    reactions: unknown
    item_id?: string
    project_id?: string
}

/**
 * Create comment via Todoist API v1.
 * We use this to pass uids_to_notify (not supported by the official REST v2 docs).
 */
export async function createCommentV1(args: CreateCommentV1Args): Promise<CommentV1Response> {
    if (!args.taskId && !args.projectId) {
        throw new Error('createCommentV1 requires taskId or projectId')
    }

    const token = await getApiToken()
    const res = await fetch('https://api.todoist.com/api/v1/comments', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            ...(args.taskId ? { task_id: args.taskId } : {}),
            ...(args.projectId ? { project_id: args.projectId } : {}),
            content: args.content,
            ...(args.attachment ? { attachment: args.attachment } : {}),
            ...(args.uidsToNotify && args.uidsToNotify.length > 0
                ? { uids_to_notify: args.uidsToNotify }
                : {}),
        }),
    })

    const text = await res.text()
    if (!res.ok) {
        throw new Error(`API v1 create comment failed: ${res.status} ${text}`)
    }

    return JSON.parse(text) as CommentV1Response
}
