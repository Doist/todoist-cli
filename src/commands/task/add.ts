import { getApi, rescheduleTask as rescheduleTaskSync } from '../../lib/api/core.js'
import { resolveAssigneeId } from '../../lib/collaborators.js'
import { CliError } from '../../lib/errors.js'
import { isQuiet } from '../../lib/global-args.js'
import { formatJson, printDryRun } from '../../lib/output.js'
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
import { applyDuration, type DurationArgs, validateFirstDueDate } from './helpers.js'

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
    firstDue?: string
}

export async function addTask(options: AddOptions): Promise<void> {
    const firstDue = validateFirstDueDate(options.firstDue, options.due)
    const api = await getApi()

    const args: Parameters<typeof api.addTask>[0] = {
        content: options.content,
    }

    if (options.due) args.dueString = options.due

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
            throw new CliError(
                'PROJECT_ARCHIVED',
                `Cannot create task in archived project "${project.name}"`,
            )
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
            throw new CliError(
                'PROJECT_REQUIRED',
                'The --project flag is required when using --section with a name.',
                ['Use id:xxx format to specify section by ID without a project.'],
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
                throw new CliError(
                    'PROJECT_REQUIRED',
                    'The --project flag is required when using --parent with a task name.',
                    ['Use id:xxx format to specify parent by ID without a project.'],
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
        throw new CliError('CONFLICTING_OPTIONS', 'Cannot use both --description and --stdin')
    }
    if (options.stdin) {
        args.description = await readStdin()
    } else if (options.description) {
        args.description = options.description
    }

    if (options.assignee) {
        if (!project) {
            throw new CliError(
                'PROJECT_REQUIRED',
                'The --project flag is required when using --assignee.',
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
            'First occurrence': firstDue,
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

    let task = await api.addTask(args)

    if (firstDue) {
        if (!task.due) {
            throw new CliError(
                'FIRST_DUE_NOT_APPLIED',
                `Task "${task.id}" was created without a due date, so its first occurrence could not be set.`,
            )
        }
        try {
            await rescheduleTaskSync(task.id, firstDue, task.due)
        } catch (error) {
            throw new CliError(
                'FIRST_DUE_NOT_APPLIED',
                `Task "${task.id}" was created, but its first occurrence could not be set.`,
                [
                    `Recover with: td task reschedule id:${task.id} ${firstDue}`,
                    `Underlying error: ${(error as Error).message}`,
                ],
            )
        }
        task = await api.getTask(task.id)
    }

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
