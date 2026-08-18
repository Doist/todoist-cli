import type { Comment, TodoistApi } from '@doist/todoist-sdk'
import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { fetchCollaboratorsForProject, formatUserShortName } from '../../lib/collaborators.js'
import { renderMarkdown } from '../../lib/markdown.js'
import type { ViewOptions } from '../../lib/options.js'
import { formatFileSize, formatJson } from '../../lib/output.js'
import { lenientIdRef } from '../../lib/refs.js'
import { commentUrl, projectCommentUrl } from '../../lib/urls.js'

const IMAGE_EXT_PATTERN = /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif|avif|tiff?)(?:\?|#|$)/i

type AttachmentLike = {
    fileName?: string | null
    fileType?: string | null
    fileUrl?: string | null
}

function isImageAttachment(att: AttachmentLike | null | undefined): boolean {
    if (!att) return false
    if (att.fileType?.startsWith('image/')) return true
    if (att.fileName && IMAGE_EXT_PATTERN.test(att.fileName)) return true
    if (att.fileUrl && IMAGE_EXT_PATTERN.test(att.fileUrl)) return true
    return false
}

const IMAGE_HINT =
    "image attachment — fetch via 'td attachment view <url>' if needed; do not download and Read directly"

export async function viewComment(commentId: string, options: ViewOptions): Promise<void> {
    const api = await getApi()
    const id = lenientIdRef(commentId, 'comment')
    const comment = await api.getComment(id)

    if (options.json) {
        console.log(formatJson(comment, 'comment', options.full, true))
        if (comment.fileAttachment?.fileUrl && isImageAttachment(comment.fileAttachment)) {
            process.stderr.write(`Hint: ${IMAGE_HINT}\n`)
        }
        return
    }

    const url = comment.taskId
        ? commentUrl(comment.taskId, comment.id)
        : comment.projectId
          ? projectCommentUrl(comment.projectId, comment.id)
          : ''

    console.log(chalk.bold('Comment'))
    console.log('')
    console.log(`ID:       ${comment.id}`)
    console.log(`Posted:   ${comment.postedAt}`)
    if (comment.uidsToNotify?.length) {
        console.log(`Notified: ${await describeNotified(api, comment)}`)
    }
    if (url) console.log(`URL:      ${url}`)
    console.log('')
    console.log('Content:')
    const content = options.raw ? comment.content : await renderMarkdown(comment.content)
    console.log(content)

    if (comment.fileAttachment) {
        const att = comment.fileAttachment
        console.log('')
        console.log(chalk.bold('Attachment:'))
        if (att.fileName) console.log(`  Name:  ${att.fileName}`)
        if (att.fileSize) console.log(`  Size:  ${formatFileSize(att.fileSize)}`)
        if (att.fileType) console.log(`  Type:  ${att.fileType}`)
        if (att.fileUrl) console.log(`  URL:   ${att.fileUrl}`)
        if (att.fileUrl && isImageAttachment(att)) {
            console.log(chalk.dim(`  Hint:  ${IMAGE_HINT}`))
        }
    }
}

/**
 * Name the comment's recipients. Only called when there are some, so a thread
 * that notifies nobody — the common case — costs no extra request. Anyone the
 * collaborator list does not cover falls back to their raw ID.
 */
async function describeNotified(api: TodoistApi, comment: Comment): Promise<string> {
    const userIds = comment.uidsToNotify ?? []
    try {
        const projectId = comment.projectId ?? (await api.getTask(comment.taskId ?? '')).projectId
        const project = await api.getProject(projectId)
        const collaborators = await fetchCollaboratorsForProject(api, project)
        const names = new Map(collaborators.map((c) => [c.id, formatUserShortName(c.name)]))
        return userIds.map((id) => names.get(id) ?? id).join(', ')
    } catch {
        return userIds.join(', ')
    }
}
