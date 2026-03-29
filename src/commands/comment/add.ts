import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { uploadFile } from '../../lib/api/uploads.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import { resolveProjectRef, resolveTaskRef } from '../../lib/refs.js'
import { readStdin } from '../../lib/stdin.js'

interface AddOptions {
    content?: string
    stdin?: boolean
    file?: string
    project?: boolean
    json?: boolean
    dryRun?: boolean
}

export async function addComment(ref: string, options: AddOptions): Promise<void> {
    if (options.content !== undefined && options.stdin) {
        throw new Error('Cannot use both --content and --stdin')
    }

    let content: string
    if (options.stdin) {
        content = await readStdin()
        if (!content.trim()) {
            throw new Error('Content is required: use --content or --stdin')
        }
    } else if (options.content) {
        content = options.content
    } else {
        throw new Error('Content is required: use --content or --stdin')
    }

    if (options.dryRun) {
        printDryRun('add comment', {
            Target: ref,
            'Target type': options.project ? 'project' : 'task',
            Content: content.length > 80 ? `${content.slice(0, 80)}...` : content,
            File: options.file,
        })
        return
    }

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
        content,
        ...(attachment && { attachment }),
    })

    if (options.json) {
        console.log(formatJson(comment, 'comment'))
        return
    }

    console.log(`Added comment to "${targetName}"`)
    if (attachment) {
        console.log(chalk.dim(`Attached: ${attachment.fileName}`))
    }
    console.log(chalk.dim(`ID: ${comment.id}`))
}
