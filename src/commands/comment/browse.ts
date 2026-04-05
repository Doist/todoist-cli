import { getApi } from '../../lib/api/core.js'
import { openInBrowser } from '../../lib/browser.js'
import { CliError } from '../../lib/errors.js'
import { lenientIdRef } from '../../lib/refs.js'
import { commentUrl, projectCommentUrl } from '../../lib/urls.js'

export async function browseComment(commentId: string): Promise<void> {
    const api = await getApi()
    const id = lenientIdRef(commentId, 'comment')
    const comment = await api.getComment(id)

    const url = comment.taskId
        ? commentUrl(comment.taskId, comment.id)
        : comment.projectId
          ? projectCommentUrl(comment.projectId, comment.id)
          : null

    if (!url) {
        throw new CliError('NO_URL', 'Comment has no associated task or project.')
    }

    await openInBrowser(url)
}
