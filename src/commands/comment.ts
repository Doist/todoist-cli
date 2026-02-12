import chalk from 'chalk'
import { Command } from 'commander'
import { getApi } from '../lib/api/core.js'
import { uploadFile } from '../lib/api/uploads.js'
import { openInBrowser } from '../lib/browser.js'
import { renderMarkdown } from '../lib/markdown.js'
import {
    formatFileSize,
    formatNextCursorFooter,
    formatPaginatedJson,
    formatPaginatedNdjson,
} from '../lib/output.js'
import { LIMITS, paginate } from '../lib/pagination.js'
import { lenientIdRef, resolveProjectRef, resolveTaskRef } from '../lib/refs.js'
import { commentUrl, projectCommentUrl } from '../lib/urls.js'

interface ListOptions {
    limit?: string
    all?: boolean
    json?: boolean
    ndjson?: boolean
    full?: boolean
    lines?: string
    project?: boolean
    raw?: boolean
    showUrls?: boolean
}

function truncateContent(content: string, maxLines: number): string {
    const lines = content.split('\n')
    if (lines.length <= maxLines) return content
    return `${lines.slice(0, maxLines).join('\n')}\n...`
}

async function listComments(ref: string, options: ListOptions): Promise<void> {
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
        const date = chalk.green(comment.postedAt.split('T')[0])
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

interface AddOptions {
    content: string
    file?: string
    project?: boolean
}

async function addComment(ref: string, options: AddOptions): Promise<void> {
    const api = await getApi()

    let targetArgs: { taskId: string } | { projectId: string }
    let targetName: string
    if (options.project) {
        const project = await resolveProjectRef(api, ref)
        targetArgs = { projectId: project.id }
        targetName = project.name
    } else {
        const task = await resolveTaskRef(api, ref)
        targetArgs = { taskId: task.id }
        targetName = task.content
    }

    let attachment:
        | {
              fileUrl: string
              fileName?: string
              fileType?: string
              resourceType?: string
          }
        | undefined

    if (options.file) {
        const uploadResult = await uploadFile(options.file)
        attachment = {
            fileUrl: uploadResult.fileUrl,
            fileName: uploadResult.fileName,
            fileType: uploadResult.fileType,
            resourceType: uploadResult.resourceType,
        }
    }

    const comment = await api.addComment({
        ...targetArgs,
        content: options.content,
        ...(attachment && { attachment }),
    })

    console.log(`Added comment to "${targetName}"`)
    if (attachment) {
        console.log(chalk.dim(`Attached: ${attachment.fileName}`))
    }
    console.log(chalk.dim(`ID: ${comment.id}`))
}

async function deleteComment(commentId: string, options: { yes?: boolean }): Promise<void> {
    const api = await getApi()
    const id = lenientIdRef(commentId, 'comment')
    const comment = await api.getComment(id)
    const preview =
        comment.content.length > 50 ? `${comment.content.slice(0, 50)}...` : comment.content

    if (!options.yes) {
        console.log(`Would delete comment: ${preview}`)
        console.log('Use --yes to confirm.')
        return
    }

    await api.deleteComment(id)
    console.log(`Deleted comment: ${preview}`)
}

async function updateComment(commentId: string, options: { content: string }): Promise<void> {
    const api = await getApi()
    const id = lenientIdRef(commentId, 'comment')
    const comment = await api.getComment(id)
    const oldPreview =
        comment.content.length > 50 ? `${comment.content.slice(0, 50)}...` : comment.content

    await api.updateComment(id, { content: options.content })
    console.log(`Updated comment: ${oldPreview}`)
}

interface ViewOptions {
    raw?: boolean
}

async function viewComment(commentId: string, options: ViewOptions): Promise<void> {
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

async function browseComment(commentId: string): Promise<void> {
    const api = await getApi()
    const id = lenientIdRef(commentId, 'comment')
    const comment = await api.getComment(id)

    const url = comment.taskId
        ? commentUrl(comment.taskId, comment.id)
        : comment.projectId
          ? projectCommentUrl(comment.projectId, comment.id)
          : null

    if (!url) {
        throw new Error('Comment has no associated task or project.')
    }

    await openInBrowser(url)
}

export function registerCommentCommand(program: Command): void {
    const comment = program.command('comment').description('Manage comments')

    const listCmd = comment
        .command('list [ref]')
        .description('List comments on a task (or project with --project)')
        .option('-P, --project', 'Target a project instead of a task')
        .option('--limit <n>', 'Limit number of results (default: 10)')
        .option('--all', 'Fetch all results (no limit)')
        .option('--show-urls', 'Show web app URLs for each comment')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .option('--lines <n>', 'Number of content lines to show (default: 3)')
        .option('--raw', 'Disable markdown rendering')
        .action((ref, options) => {
            if (!ref) {
                listCmd.help()
                return
            }
            return listComments(ref, options)
        })

    const addCmd = comment
        .command('add [ref]')
        .description('Add a comment to a task (or project with --project)')
        .option('-P, --project', 'Target a project instead of a task')
        .option('--content <text>', 'Comment content (required)')
        .option('--file <path>', 'Attach a file to the comment')
        .action((ref, options) => {
            if (!ref || !options.content) {
                addCmd.help()
                return
            }
            return addComment(ref, options)
        })

    const deleteCmd = comment
        .command('delete [id]')
        .description('Delete a comment')
        .option('--yes', 'Confirm deletion')
        .action((id, options) => {
            if (!id) {
                deleteCmd.help()
                return
            }
            return deleteComment(id, options)
        })

    const updateCmd = comment
        .command('update [id]')
        .description('Update a comment')
        .option('--content <text>', 'New comment content (required)')
        .action((id, options) => {
            if (!id || !options.content) {
                updateCmd.help()
                return
            }
            return updateComment(id, options)
        })

    const viewCmd = comment
        .command('view [id]')
        .description('View a single comment with full details')
        .option('--raw', 'Disable markdown rendering')
        .action((id, options) => {
            if (!id) {
                viewCmd.help()
                return
            }
            return viewComment(id, options)
        })

    const browseCmd = comment
        .command('browse [id]')
        .description('Open comment in browser (requires id:xxx)')
        .action((id) => {
            if (!id) {
                browseCmd.help()
                return
            }
            return browseComment(id)
        })
}
