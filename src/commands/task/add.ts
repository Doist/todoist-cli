import { getApi } from '../../lib/api/core.js'
import { resolveAssigneeId } from '../../lib/collaborators.js'
import { formatError, formatJson, isQuiet, printDryRun } from '../../lib/output.js'
import {
    extractId,
    isIdRef,
    looksLikeRawId,
    resolveParentTaskId,
    resolveProjectRef,
    resolveSectionId,
} from '../../lib/refs.js'
import { readStdin } from '../../lib/stdin.js'
import { parsePriority } from '../../lib/task-list.js'
import { applyDuration, type DurationArgs } from './helpers.js'

export interface AddOptions {
    content: string
    due?: string
    deadline?: string
    priority?: string
    project?: string
    section?: string
    labels?: string
    parent?: string
    description?: string
    stdin?: boolean
    assignee?: string
    duration?: string
    uncompletable?: boolean
    order?: number
    json?: boolean
    dryRun?: boolean
}

export async function addTask(options: AddOptions): Promise<void> {
    const api = await getApi()

    const args: Parameters<typeof api.addTask>[0] = {
        content: options.content,
    }

    if (options.due) {
        args.dueString = options.due
    }

    if (options.deadline) {
        args.deadlineDate = options.deadline
    }

    if (options.priority) {
        args.priority = parsePriority(options.priority)
    }

    let project = null
    if (options.project) {
        project = await resolveProjectRef(api, options.project)
        if (project.isArchived) {
            throw new Error(`Cannot create task in archived project "${project.name}"`)
        }
        args.projectId = project.id
    }

    if (options.section) {
        if (isIdRef(options.section)) {
            args.sectionId = extractId(options.section)
        } else if (args.projectId) {
            args.sectionId = await resolveSectionId(api, options.section, args.projectId)
        } else if (looksLikeRawId(options.section)) {
            args.sectionId = options.section
        } else {
            throw new Error(
                formatError(
                    'PROJECT_REQUIRED',
                    'The --project flag is required when using --section with a name.',
                    ['Use id:xxx format to specify section by ID without a project.'],
                ),
            )
        }
    }

    if (options.labels) {
        args.labels = options.labels.split(',').map((l) => l.trim())
    }

    if (options.parent) {
        if (isIdRef(options.parent)) {
            args.parentId = extractId(options.parent)
        } else {
            if (!args.projectId) {
                throw new Error(
                    formatError(
                        'PROJECT_REQUIRED',
                        'The --project flag is required when using --parent with a task name.',
                        ['Use id:xxx format to specify parent by ID without a project.'],
                    ),
                )
            }
            args.parentId = await resolveParentTaskId(
                api,
                options.parent,
                args.projectId,
                args.sectionId,
            )
        }
    }

    if (options.stdin && options.description !== undefined) {
        throw new Error('Cannot use both --description and --stdin')
    }
    if (options.stdin) {
        args.description = await readStdin()
    } else if (options.description) {
        args.description = options.description
    }

    if (options.assignee) {
        if (!project) {
            throw new Error(
                formatError(
                    'PROJECT_REQUIRED',
                    'The --project flag is required when using --assignee.',
                ),
            )
        }
        args.assigneeId = await resolveAssigneeId(api, options.assignee, project)
    }

    if (options.duration) {
        applyDuration(args as DurationArgs, options.duration)
    }

    if (options.uncompletable) {
        args.isUncompletable = true
    }

    if (options.order !== undefined) {
        args.order = options.order
    }

    if (options.dryRun) {
        printDryRun('add task', {
            Content: args.content,
            Description: args.description,
            Due: args.dueString,
            Deadline: args.deadlineDate ?? undefined,
            Priority: options.priority,
            Project: options.project,
            Section: options.section,
            Labels: options.labels,
            Parent: options.parent,
            Assignee: options.assignee,
            Duration: options.duration,
            Uncompletable: options.uncompletable ? 'yes' : undefined,
            Order: options.order !== undefined ? String(options.order) : undefined,
        })
        return
    }

    const task = await api.addTask(args)

    if (options.json) {
        console.log(formatJson(task, 'task'))
        return
    }

    if (isQuiet()) {
        console.log(task.id)
        return
    }

    console.log(`Created: ${task.content}`)
    if (task.due) console.log(`Due: ${task.due.string || task.due.date}`)
    if (task.deadline) console.log(`Deadline: ${task.deadline.date}`)
    console.log(`ID: ${task.id}`)
}
