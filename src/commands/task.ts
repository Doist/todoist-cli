import type { Task } from '@doist/todoist-api-typescript'
import { Command } from 'commander'
import { completeTaskForever, getApi } from '../lib/api/core.js'
import { openInBrowser } from '../lib/browser.js'
import { parseDuration } from '../lib/duration.js'
import { formatError, formatJson, formatTaskView } from '../lib/output.js'
import { taskUrl } from '../lib/urls.js'

type DurationArgs = { duration?: number; durationUnit?: 'minute' | 'day' }

function applyDuration(args: DurationArgs, durationStr: string): void {
    const minutes = parseDuration(durationStr)
    if (minutes === null) {
        throw new Error(
            formatError('INVALID_DURATION', `Invalid duration format: "${durationStr}"`, [
                'Examples: 30m, 1h, 2h15m, 1 hour 30 minutes',
            ]),
        )
    }
    args.duration = minutes
    args.durationUnit = 'minute'
}

import { resolveAssigneeId } from '../lib/collaborators.js'
import {
    extractId,
    isIdRef,
    lenientIdRef,
    looksLikeRawId,
    resolveParentTaskId,
    resolveProjectId,
    resolveProjectRef,
    resolveSectionId,
    resolveTaskRef,
} from '../lib/refs.js'
import { listTasksForProject, parsePriority, type TaskListOptions } from '../lib/task-list.js'

interface ListOptions extends TaskListOptions {
    project?: string
    parent?: string
    label?: string
    assignee?: string
    unassigned?: boolean
    workspace?: string
    personal?: boolean
}

interface ViewOptions {
    full?: boolean
    json?: boolean
    raw?: boolean
}

async function listTasks(options: ListOptions): Promise<void> {
    const api = await getApi()

    let projectId: string | null = null
    if (options.project) {
        projectId = await resolveProjectId(api, options.project)
    }

    let parentId: string | undefined
    if (options.parent) {
        const parentTask = await resolveTaskRef(api, options.parent)
        parentId = parentTask.id
        if (!projectId) projectId = parentTask.projectId
    }

    await listTasksForProject(projectId, { ...options, parent: parentId })
}

async function viewTask(ref: string, options: ViewOptions): Promise<void> {
    const api = await getApi()
    const task = await resolveTaskRef(api, ref)

    if (options.json) {
        console.log(formatJson(task, 'task', options.full, true))
        return
    }

    const { results: projects } = await api.getProjects()
    const project = projects.find((p) => p.id === task.projectId)

    let parentTask: Task | undefined
    if (task.parentId) {
        parentTask = await api.getTask(task.parentId)
    }

    const { results: subtasks } = await api.getTasks({ parentId: task.id })
    const subtaskCount = subtasks.length

    console.log(
        formatTaskView({
            task,
            project,
            parentTask,
            subtaskCount,
            full: options.full,
            raw: options.raw,
        }),
    )
}

async function completeTask(ref: string, options: { forever?: boolean }): Promise<void> {
    const api = await getApi()
    const task = await resolveTaskRef(api, ref)

    if (task.checked) {
        console.log('Task already completed.')
        return
    }

    if (task.isUncompletable) {
        console.log('Task is uncompletable (reference item).')
        return
    }

    if (options.forever) {
        const isRecurring = task.due?.isRecurring ?? false
        if (!isRecurring) {
            console.log('Task is not recurring, completing normally.')
        }
        await completeTaskForever(task.id)
        console.log(`Completed forever: ${task.content}`)
        return
    }

    await api.closeTask(task.id)
    console.log(`Completed: ${task.content}`)
}

async function uncompleteTask(ref: string): Promise<void> {
    const api = await getApi()
    const id = lenientIdRef(ref, 'task')
    await api.reopenTask(id)
    console.log(`Reopened task ${id}`)
}

async function deleteTask(ref: string, options: { yes?: boolean }): Promise<void> {
    const api = await getApi()
    const task = await resolveTaskRef(api, ref)

    if (!options.yes) {
        console.log(`Would delete: ${task.content}`)
        console.log('Use --yes to confirm.')
        return
    }

    await api.deleteTask(task.id)
    console.log(`Deleted: ${task.content}`)
}

interface AddOptions {
    content: string
    due?: string
    deadline?: string
    priority?: string
    project?: string
    section?: string
    labels?: string
    parent?: string
    description?: string
    assignee?: string
    duration?: string
}

async function addTask(options: AddOptions): Promise<void> {
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
        if (isIdRef(options.section) || looksLikeRawId(options.section)) {
            args.sectionId = lenientIdRef(options.section, 'section')
        } else if (args.projectId) {
            args.sectionId = await resolveSectionId(api, options.section, args.projectId)
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

    if (options.description) {
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

    const task = await api.addTask(args)
    console.log(`Created: ${task.content}`)
    if (task.due) console.log(`Due: ${task.due.string || task.due.date}`)
    if (task.deadline) console.log(`Deadline: ${task.deadline.date}`)
    console.log(`ID: ${task.id}`)
}

interface UpdateOptions {
    content?: string
    due?: string
    deadline?: string | false
    priority?: string
    labels?: string
    description?: string
    assignee?: string
    unassign?: boolean
    duration?: string
}

async function updateTask(ref: string, options: UpdateOptions): Promise<void> {
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
    if (options.description) args.description = options.description

    if (options.unassign) {
        args.assigneeId = null
    } else if (options.assignee) {
        const project = await api.getProject(task.projectId)
        args.assigneeId = await resolveAssigneeId(api, options.assignee, project)
    }

    if (options.duration) {
        applyDuration(args as DurationArgs, options.duration)
    }

    const updated = await api.updateTask(task.id, args)
    console.log(`Updated: ${updated.content}`)
}

interface MoveOptions {
    project?: string
    section?: string | false
    parent?: string | false
}

async function moveTask(ref: string, options: MoveOptions): Promise<void> {
    const wantsNoParent = options.parent === false
    const wantsNoSection = options.section === false
    const hasDestination =
        options.project || options.section || options.parent || wantsNoParent || wantsNoSection
    if (!hasDestination) {
        throw new Error(
            formatError(
                'MISSING_DESTINATION',
                'At least one of --project, --section, --parent, --no-parent, or --no-section is required.',
            ),
        )
    }

    const api = await getApi()
    const task = await resolveTaskRef(api, ref)

    if (wantsNoParent || wantsNoSection) {
        const targetProjectId = options.project
            ? await resolveProjectId(api, options.project)
            : task.projectId
        await api.moveTask(task.id, { projectId: targetProjectId })
        console.log(`Moved: ${task.content}`)
        return
    }

    const targetProjectId = options.project
        ? await resolveProjectId(api, options.project)
        : task.projectId

    let targetSectionId: string | undefined
    if (options.section) {
        targetSectionId = await resolveSectionId(api, options.section, targetProjectId)
    }

    if (options.parent) {
        const parentId = await resolveParentTaskId(
            api,
            options.parent,
            targetProjectId,
            targetSectionId ?? task.sectionId ?? undefined,
        )
        await api.moveTask(task.id, { parentId })
    } else if (targetSectionId) {
        await api.moveTask(task.id, { sectionId: targetSectionId })
    } else {
        await api.moveTask(task.id, { projectId: targetProjectId })
    }
    console.log(`Moved: ${task.content}`)
}

async function browseTask(ref: string): Promise<void> {
    const api = await getApi()
    const task = await resolveTaskRef(api, ref)
    await openInBrowser(taskUrl(task.id))
}

export function registerTaskCommand(program: Command): void {
    const task = program.command('task').description('Manage tasks')

    task.command('list')
        .description('List tasks')
        .option('--project <name>', 'Filter by project name or id:xxx')
        .option('--parent <ref>', 'Filter subtasks of a parent task')
        .option('--label <name>', 'Filter by label (comma-separated for multiple)')
        .option('--priority <p1-p4>', 'Filter by priority')
        .option('--due <date>', 'Filter by due date (today, overdue, or YYYY-MM-DD)')
        .option('--filter <query>', 'Raw Todoist filter query')
        .option('--assignee <ref>', 'Filter by assignee (me or id:xxx)')
        .option('--unassigned', 'Show only unassigned tasks')
        .option('--workspace <name>', 'Filter to tasks in workspace')
        .option('--personal', 'Filter to tasks in personal projects')
        .option('--limit <n>', 'Limit number of results (default: 300)')
        .option('--cursor <cursor>', 'Continue from cursor')
        .option('--all', 'Fetch all results (no limit)')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .option('--raw', 'Disable markdown rendering')
        .option('--show-urls', 'Show web app URLs for each task')
        .action(listTasks)

    task.command('view [ref]', { isDefault: true })
        .description('View task details')
        .option('--json', 'Output as JSON')
        .option('--full', 'Include all fields in output')
        .option('--raw', 'Disable markdown rendering')
        .action((ref, options) => {
            if (!ref) {
                task.help()
                return
            }
            return viewTask(ref, options)
        })

    const completeCmd = task
        .command('complete [ref]')
        .description('Complete a task')
        .option('--forever', 'Complete recurring task permanently (stops recurrence)')
        .action((ref, options) => {
            if (!ref) {
                completeCmd.help()
                return
            }
            return completeTask(ref, options)
        })

    const uncompleteCmd = task
        .command('uncomplete [ref]')
        .description('Reopen a completed task (requires id:xxx)')
        .action((ref) => {
            if (!ref) {
                uncompleteCmd.help()
                return
            }
            return uncompleteTask(ref)
        })

    const deleteCmd = task
        .command('delete [ref]')
        .description('Delete a task')
        .option('--yes', 'Confirm deletion')
        .action((ref, options) => {
            if (!ref) {
                deleteCmd.help()
                return
            }
            return deleteTask(ref, options)
        })

    const addCmd = task
        .command('add [content]')
        .description('Add a task')
        .option('--content <text>', 'Task content (legacy, prefer positional argument)')
        .option('--due <date>', 'Due date (natural language or YYYY-MM-DD)')
        .option('--deadline <date>', 'Deadline date (YYYY-MM-DD)')
        .option('--priority <p1-p4>', 'Priority level')
        .option('--project <name>', 'Project name or id:xxx')
        .option('--section <ref>', 'Section (name with --project, or id:xxx)')
        .option('--labels <a,b>', 'Comma-separated labels')
        .option('--parent <ref>', 'Parent task reference')
        .option('--description <text>', 'Task description')
        .option('--assignee <ref>', 'Assign to user (name, email, id:xxx, or "me")')
        .option('--duration <time>', 'Duration (e.g., 30m, 1h, 2h15m)')
        .action((contentArg: string | undefined, options: AddOptions & { content?: string }) => {
            if (contentArg && options.content) {
                throw new Error('Cannot specify content both as argument and --content flag')
            }
            const content = contentArg || options.content
            if (!content) {
                addCmd.help()
                return
            }
            return addTask({ ...options, content })
        })

    const updateCmd = task
        .command('update [ref]')
        .description('Update a task')
        .option('--content <text>', 'New content')
        .option('--due <date>', 'New due date')
        .option('--deadline <date>', 'Deadline date (YYYY-MM-DD)')
        .option('--no-deadline', 'Remove deadline')
        .option('--priority <p1-p4>', 'New priority')
        .option('--labels <a,b>', 'New labels (replaces existing)')
        .option('--description <text>', 'New description')
        .option('--assignee <ref>', 'Assign to user (name, email, id:xxx, or "me")')
        .option('--unassign', 'Remove assignee')
        .option('--duration <time>', 'Duration (e.g., 30m, 1h, 2h15m)')
        .action((ref, options) => {
            if (!ref) {
                updateCmd.help()
                return
            }
            return updateTask(ref, options)
        })

    const moveCmd = task
        .command('move [ref]')
        .description('Move task to project/section/parent')
        .option('--project <ref>', 'Target project (name or id:xxx)')
        .option('--section <ref>', 'Target section (name or id:xxx)')
        .option('--parent <ref>', 'Parent task (name or id:xxx)')
        .option('--no-parent', 'Remove parent (move to project root)')
        .option('--no-section', 'Remove section (move to project root)')
        .action((ref, options) => {
            if (!ref) {
                moveCmd.help()
                return
            }
            return moveTask(ref, options)
        })

    const browseCmd = task
        .command('browse [ref]')
        .description('Open task in browser')
        .action((ref) => {
            if (!ref) {
                browseCmd.help()
                return
            }
            return browseTask(ref)
        })
}
