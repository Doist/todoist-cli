import { getApi } from '../../lib/api/core.js'
import { isQuiet } from '../../lib/global-args.js'
import { printDryRun } from '../../lib/output.js'
import { lenientIdRef } from '../../lib/refs.js'

export async function deleteComment(
    commentId: string,
    options: { yes?: boolean; dryRun?: boolean },
): Promise<void> {
    const id = lenientIdRef(commentId, 'comment')

    const api = await getApi()
    const comment = await api.getComment(id)
    const preview =
        comment.content.length > 50 ? `${comment.content.slice(0, 50)}...` : comment.content

    if (options.dryRun) {
        printDryRun('delete comment', { Comment: preview })
        return
    }

    if (!options.yes) {
        console.log(`Would delete comment: ${preview}`)
        console.log('Use --yes to confirm.')
        return
    }

    await api.deleteComment(id)
    if (!isQuiet()) console.log(`Deleted comment: ${preview} (id:${id})`)
}
