import { getApi } from '../../lib/api/core.js'
import { resolveAssigneeId } from '../../lib/collaborators.js'
import { CliError } from '../../lib/errors.js'
import { isQuiet } from '../../lib/global-args.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import { resolveTaskRef } from '../../lib/refs.js'
import { readStdin } from '../../lib/stdin.js'
import { parsePriority } from '../../lib/task-list.js'
import { applyDuration, type DurationArgs } from './helpers.js'

export interface UpdateOptions {
    content?: string
    due?: string
    deadline?: string | false
    priority?: string
    labels?: string
    description?: string
    stdin?: boolean
    assignee?: string
    unassign?: boolean
    duration?: string
    uncompletable?: boolean
    completable?: boolean
    order?: number
    json?: boolean
    dryRun?: boolean
}

export async function updateTask(ref: string, options: UpdateOptions): Promise<void> {
    const api = await getApi()
    const task = await resolveTaskRef(api, ref)

    const args: Parameters<typeof api.updateTask>[1] = {}

    if (options.content) args.content = options.content
    if (options.due) args.dueString = options.due
    if (options.deadline === false) {
        args.deadlineDate = null
    } else if (options.deadline) {
        args.deadlineDate = options.deadline
    }
    if (options.priority) args.priority = parsePriority(options.priority)
    if (options.labels) args.labels = options.labels.split(',').map((l) => l.trim())

    if (options.stdin && options.description !== undefined) {
        throw new CliError('CONFLICTING_OPTIONS', 'Cannot use both --description and --stdin')
    }
    if (options.stdin) {
        args.description = await readStdin()
    } else if (options.description) {
        args.description = options.description
    }

    if (options.unassign) {
        args.assigneeId = null
    } else if (options.assignee) {
        const project = await api.getProject(task.projectId)
        args.assigneeId = await resolveAssigneeId(api, options.assignee, project)
    }

    if (options.duration) {
        applyDuration(args as DurationArgs, options.duration)
    }

    if (options.uncompletable && options.completable) {
        throw new CliError(
            'CONFLICTING_OPTIONS',
            'Cannot use --uncompletable and --completable together',
        )
    } else if (options.uncompletable) {
        args.isUncompletable = true
    } else if (options.completable) {
        args.isUncompletable = false
    }

    if (options.order !== undefined) {
        args.order = options.order
    }

    if (options.dryRun) {
        printDryRun('update task', {
            Task: task.content,
            Content: args.content,
            Description: args.description ?? undefined,
            Due: args.dueString ?? undefined,
            Deadline: args.deadlineDate ?? undefined,
            Priority: options.priority,
            Labels: options.labels,
            Assignee: options.assignee,
            Unassign: options.unassign ? 'yes' : undefined,
            Duration: options.duration,
            Uncompletable: options.uncompletable ? 'yes' : undefined,
            Completable: options.completable ? 'yes' : undefined,
            Order: options.order !== undefined ? String(options.order) : undefined,
        })
        return
    }

    const updated = await api.updateTask(task.id, args)

    if (options.json) {
        console.log(formatJson(updated, 'task'))
        return
    }

    if (!isQuiet()) console.log(`Updated: ${updated.content} (id:${task.id})`)
}
