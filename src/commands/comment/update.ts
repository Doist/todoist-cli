import { getApi } from '../../lib/api/core.js'
import { isQuiet } from '../../lib/global-args.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import { lenientIdRef } from '../../lib/refs.js'
import { truncateForDisplay } from '../../lib/text.js'

export async function updateComment(
    commentId: string,
    options: { content: string; json?: boolean; dryRun?: boolean },
): Promise<void> {
    const id = lenientIdRef(commentId, 'comment')

    if (options.dryRun) {
        const preview = truncateForDisplay(options.content, 80)
        printDryRun('update comment', { ID: id, Content: preview })
        return
    }

    const api = await getApi()

    if (options.json) {
        const updated = await api.updateComment(id, { content: options.content })
        console.log(formatJson(updated, 'comment'))
        return
    }

    const comment = await api.getComment(id)
    const oldPreview = truncateForDisplay(comment.content, 50)
    await api.updateComment(id, { content: options.content })
    if (!isQuiet()) console.log(`Updated comment: ${oldPreview} (id:${id})`)
}
