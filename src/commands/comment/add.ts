import chalk from 'chalk'
import { getApi, getCurrentUserId } from '../../lib/api/core.js'
import {
    type CollaboratorInfo,
    fetchCollaboratorsForProject,
    formatUserShortName,
    resolveNotifyIds,
} from '../../lib/collaborators.js'
import { getDefaultCommentRecipients } from '../../lib/comment-recipients.js'
import { CliError } from '../../lib/errors.js'
import { isQuiet } from '../../lib/global-args.js'
import { openLocalFileAsBlob } from '../../lib/local-file.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import { resolveProjectRef, resolveTaskRef } from '../../lib/refs.js'
import { readStdin } from '../../lib/stdin.js'

interface AddOptions {
    content?: string
    stdin?: boolean
    file?: string
    fileName?: string
    project?: boolean
    // Commander sets this to false for --no-notify, and to the raw
    // comma-separated string for --notify.
    notify?: string | false
    json?: boolean
    dryRun?: boolean
}

export async function addComment(ref: string, options: AddOptions): Promise<void> {
    if (options.content !== undefined && options.stdin) {
        throw new CliError('CONFLICTING_OPTIONS', 'Cannot use both --content and --stdin')
    }

    let content: string
    if (options.stdin) {
        content = await readStdin()
        if (!content.trim()) {
            throw new CliError('MISSING_CONTENT', 'Content is required: use --content or --stdin')
        }
    } else if (options.content) {
        content = options.content
    } else {
        throw new CliError('MISSING_CONTENT', 'Content is required: use --content or --stdin')
    }

    let attachmentFile: Blob | undefined
    let attachmentFileName: string | undefined
    if (options.file) {
        const opened = await openLocalFileAsBlob({
            file: options.file,
            fileName: options.fileName,
        })
        attachmentFile = opened.blob
        attachmentFileName = opened.fileName
    }

    if (options.dryRun) {
        printDryRun('add comment', {
            Target: ref,
            'Target type': options.project ? 'project' : 'task',
            Content: content.length > 80 ? `${content.slice(0, 80)}...` : content,
            File: options.file,
            // Printed unresolved: the dry-run deliberately runs before getApi(),
            // so no lookup has happened at this point.
            Notify: describeNotifyOption(options.notify),
        })
        return
    }

    const api = await getApi()

    let targetArgs: { taskId: string } | { projectId: string }
    let targetName: string
    let targetProjectId: string
    if (options.project) {
        const project = await resolveProjectRef(api, ref)
        targetArgs = { projectId: project.id }
        targetName = project.name
        targetProjectId = project.id
    } else {
        const task = await resolveTaskRef(api, ref)
        targetArgs = { taskId: task.id }
        targetName = task.content
        targetProjectId = task.projectId
    }

    // Held so the confirmation line can name people without a second fetch.
    let notifyCollaborators: CollaboratorInfo[] | undefined
    let uidsToNotify: string[]
    if (options.notify === false) {
        uidsToNotify = []
    } else if (options.notify) {
        const project = await api.getProject(targetProjectId)
        notifyCollaborators = await fetchCollaboratorsForProject(api, project)
        uidsToNotify = resolveNotifyIds({
            refs: options.notify.split(','),
            collaborators: notifyCollaborators,
            currentUserId: await getCurrentUserId(),
            projectName: project.name,
        })
    } else {
        uidsToNotify = await getDefaultCommentRecipients(api, targetArgs, await getCurrentUserId())
    }

    let attachment:
        | {
              fileUrl: string
              fileName?: string
              fileType?: string
              resourceType?: string
          }
        | undefined

    if (attachmentFile && attachmentFileName) {
        const uploadResult = await api.uploadFile({
            file: attachmentFile,
            fileName: attachmentFileName,
        })
        if (!uploadResult.fileUrl) {
            throw new CliError('UPLOAD_FAILED', 'Upload succeeded but no file URL was returned')
        }
        attachment = {
            fileUrl: uploadResult.fileUrl,
            fileName: uploadResult.fileName ?? attachmentFileName,
            fileType: uploadResult.fileType ?? undefined,
            resourceType: uploadResult.resourceType,
        }
    }

    const comment = await api.addComment({
        ...targetArgs,
        content,
        ...(attachment && { attachment }),
        ...(uidsToNotify.length > 0 && { uidsToNotify }),
    })

    if (options.json) {
        console.log(formatJson(comment, 'comment'))
        return
    }

    if (isQuiet()) {
        console.log(comment.id)
        return
    }

    console.log(`Added comment to "${targetName}"`)
    if (attachment) {
        console.log(chalk.dim(`Attached: ${attachment.fileName}`))
    }
    if (uidsToNotify.length > 0) {
        const names = await describeRecipients(
            api,
            uidsToNotify,
            targetProjectId,
            notifyCollaborators,
        )
        console.log(chalk.dim(`Notified: ${names}`))
    }
    console.log(chalk.dim(`ID: ${comment.id}`))
}

function describeNotifyOption(notify: string | false | undefined): string | undefined {
    if (notify === false) return '(nobody)'
    if (notify) return notify
    return undefined
}

/**
 * Render recipients as short names, falling back to the raw ID for anyone the
 * collaborator list does not cover — the same fallback `formatAssignee` makes.
 */
async function describeRecipients(
    api: Awaited<ReturnType<typeof getApi>>,
    userIds: string[],
    projectId: string,
    known: CollaboratorInfo[] | undefined,
): Promise<string> {
    try {
        const collaborators =
            known ?? (await fetchCollaboratorsForProject(api, await api.getProject(projectId)))
        const names = new Map(collaborators.map((c) => [c.id, formatUserShortName(c.name)]))
        return userIds.map((id) => names.get(id) ?? id).join(', ')
    } catch {
        // Naming people is a nicety; never fail a posted comment over it.
        return userIds.join(', ')
    }
}
