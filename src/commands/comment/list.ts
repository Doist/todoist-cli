import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { renderMarkdown } from '../../lib/markdown.js'
import type { PaginatedViewOptions } from '../../lib/options.js'
import {
    formatNextCursorFooter,
    formatPaginatedJson,
    formatPaginatedNdjson,
} from '../../lib/output.js'
import { LIMITS, paginate } from '../../lib/pagination.js'
import { resolveProjectRef, resolveTaskRef } from '../../lib/refs.js'
import { commentUrl, projectCommentUrl } from '../../lib/urls.js'
import { truncateContent } from './helpers.js'

type ListOptions = PaginatedViewOptions & { lines?: string; project?: boolean }

export async function listComments(ref: string, options: ListOptions): Promise<void> {
    const api = await getApi()

    let queryArgs: { taskId: string } | { projectId: string }
    if (options.project) {
        const project = await resolveProjectRef(api, ref)
        queryArgs = { projectId: project.id }
    } else {
        const task = await resolveTaskRef(api, ref)
        queryArgs = { taskId: task.id }
    }

    const targetLimit = options.all
        ? Number.MAX_SAFE_INTEGER
        : options.limit
          ? parseInt(options.limit, 10)
          : LIMITS.comments

    const { results: comments, nextCursor } = await paginate(
        (cursor, limit) => api.getComments({ ...queryArgs, cursor: cursor ?? undefined, limit }),
        { limit: targetLimit },
    )

    const enrichedComments = comments.map((c) => ({
        ...c,
        hasAttachment: c.fileAttachment !== null,
    }))

    if (options.json) {
        console.log(
            formatPaginatedJson(
                { results: enrichedComments, nextCursor },
                'comment',
                options.full,
                options.showUrls,
            ),
        )
        return
    }

    if (options.ndjson) {
        console.log(
            formatPaginatedNdjson(
                { results: enrichedComments, nextCursor },
                'comment',
                options.full,
                options.showUrls,
            ),
        )
        return
    }

    if (comments.length === 0) {
        console.log('No comments.')
        return
    }

    const maxLines = options.lines ? parseInt(options.lines, 10) : 3

    for (const comment of comments) {
        const id = chalk.dim(comment.id)
        const date = chalk.green(comment.postedAt.toISOString().split('T')[0])
        const hasAttachment = comment.fileAttachment !== null
        console.log(`${id}  ${date}${hasAttachment ? `  ${chalk.blue('[file]')}` : ''}`)
        const content = options.raw ? comment.content : renderMarkdown(comment.content)
        const truncated = truncateContent(content, maxLines)
        for (const line of truncated.split('\n')) {
            console.log(`  ${line}`)
        }
        if (options.showUrls) {
            const url =
                'taskId' in queryArgs
                    ? commentUrl(queryArgs.taskId, comment.id)
                    : projectCommentUrl(queryArgs.projectId, comment.id)
            console.log(`  ${chalk.dim(url)}`)
        }
        console.log('')
    }
    console.log(formatNextCursorFooter(nextCursor))
}
