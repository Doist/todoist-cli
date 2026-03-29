import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { renderMarkdown } from '../../lib/markdown.js'
import type { ViewOptions } from '../../lib/options.js'
import { formatFileSize } from '../../lib/output.js'
import { lenientIdRef } from '../../lib/refs.js'
import { commentUrl, projectCommentUrl } from '../../lib/urls.js'

export async function viewComment(commentId: string, options: ViewOptions): Promise<void> {
    const api = await getApi()
    const id = lenientIdRef(commentId, 'comment')
    const comment = await api.getComment(id)

    const url = comment.taskId
        ? commentUrl(comment.taskId, comment.id)
        : comment.projectId
          ? projectCommentUrl(comment.projectId, comment.id)
          : ''

    console.log(chalk.bold('Comment'))
    console.log('')
    console.log(`ID:      ${comment.id}`)
    console.log(`Posted:  ${comment.postedAt}`)
    if (url) console.log(`URL:     ${url}`)
    console.log('')
    console.log('Content:')
    const content = options.raw ? comment.content : renderMarkdown(comment.content)
    console.log(content)

    if (comment.fileAttachment) {
        const att = comment.fileAttachment
        console.log('')
        console.log(chalk.bold('Attachment:'))
        if (att.fileName) console.log(`  Name:  ${att.fileName}`)
        if (att.fileSize) console.log(`  Size:  ${formatFileSize(att.fileSize)}`)
        if (att.fileType) console.log(`  Type:  ${att.fileType}`)
        if (att.fileUrl) console.log(`  URL:   ${att.fileUrl}`)
    }
}
