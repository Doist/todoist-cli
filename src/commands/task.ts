import type { Task } from '@doist/todoist-api-typescript'
import { Command, Option } from 'commander'
import {
    completeTaskForever,
    getApi,
    rescheduleTask as rescheduleTaskSync,
} from '../lib/api/core.js'
import { openInBrowser } from '../lib/browser.js'
import { withCaseInsensitiveChoices } from '../lib/completion.js'
import { parseDuration } from '../lib/duration.js'
import { formatDue, formatError, formatJson, formatTaskView, printDryRun } from '../lib/output.js'
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
import type { ViewOptions } from '../lib/options.js'
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
import { readStdin } from '../lib/stdin.js'
import {
    listTasksForProject,
    PRIORITY_CHOICES,
    parsePriority,
    type TaskListOptions,
} from '../lib/task-list.js'

type ListOptions = TaskListOptions & { project?: string }

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

export async function viewTask(ref: string, options: ViewOptions): Promise<void> {
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

async function completeTask(
    ref: string,
    options: { forever?: boolean; dryRun?: boolean },
): Promise<void> {
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

    if (options.dryRun) {
        printDryRun('complete task', {
            Task: task.content,
            Forever: options.forever ? 'yes' : undefined,
        })
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

async function uncompleteTask(ref: string, options: { dryRun?: boolean }): Promise<void> {
    const id = lenientIdRef(ref, 'task')

    if (options.dryRun) {
        printDryRun('reopen task', { ID: id })
        return
    }

    const api = await getApi()
    await api.reopenTask(id)
    console.log(`Reopened task ${id}`)
}

async function deleteTask(
    ref: string,
    options: { yes?: boolean; dryRun?: boolean },
): Promise<void> {
    const api = await getApi()
    const task = await resolveTaskRef(api, ref)

    if (options.dryRun || !options.yes) {
        console.log(`Would delete: ${task.content}`)
        if (!options.dryRun) console.log('Use --yes to confirm.')
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
    stdin?: boolean
    assignee?: string
    duration?: string
    uncompletable?: boolean
    order?: number
    json?: boolean
    dryRun?: boolean
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
            Due: args.dueString,
            Deadline: args.deadlineDate ?? undefined,
            Priority: options.priority,
            Project: options.project,
            Section: options.section,
            Labels: options.labels,
            Parent: options.parent,
            Duration: options.duration,
        })
        return
    }

    const task = await api.addTask(args)

    if (options.json) {
        console.log(formatJson(task, 'task'))
        return
    }

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

    if (options.stdin && options.description !== undefined) {
        throw new Error('Cannot use both --description and --stdin')
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
        throw new Error('Cannot use --uncompletable and --completable together')
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
            Due: args.dueString ?? undefined,
            Priority: options.priority,
            Labels: options.labels,
            Duration: options.duration,
        })
        return
    }

    const updated = await api.updateTask(task.id, args)

    if (options.json) {
        console.log(formatJson(updated, 'task'))
        return
    }

    console.log(`Updated: ${updated.content}`)
}

interface MoveOptions {
    project?: string
    section?: string | false
    parent?: string | false
    dryRun?: boolean
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

    if (options.dryRun) {
        printDryRun('move task', {
            Task: task.content,
            Project: typeof options.project === 'string' ? options.project : undefined,
            Section: typeof options.section === 'string' ? options.section : undefined,
            Parent: typeof options.parent === 'string' ? options.parent : undefined,
        })
        return
    }

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

async function rescheduleTask(
    ref: string,
    date: string,
    options: { json?: boolean; dryRun?: boolean },
): Promise<void> {
    const api = await getApi()
    const task = await resolveTaskRef(api, ref)

    if (!task.due) {
        throw new Error(
            formatError(
                'NO_DUE_DATE',
                `Task "${task.content}" has no due date. Use "td task update --due" to set one.`,
            ),
        )
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})?)?$/
    if (!dateRegex.test(date)) {
        throw new Error(
            formatError('INVALID_DATE', `Invalid date format: "${date}"`, [
                'Use YYYY-MM-DD for date-only, or YYYY-MM-DDTHH:MM:SS for datetime.',
                'Examples: 2026-03-20, 2026-03-20T14:00:00',
            ]),
        )
    }

    if (options.dryRun) {
        printDryRun('reschedule task', {
            Task: task.content,
            Date: date,
        })
        return
    }

    await rescheduleTaskSync(task.id, date, task.due)

    const updated = await api.getTask(task.id)

    if (options.json) {
        console.log(formatJson(updated, 'task'))
        return
    }

    console.log(`Rescheduled: ${updated.content}`)
    const due = formatDue(updated.due)
    if (due) {
        console.log(`Due: ${due}`)
    }
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
        .addOption(
            withCaseInsensitiveChoices(
                new Option('--priority <p1-p4>', 'Filter by priority'),
                PRIORITY_CHOICES,
            ),
        )
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
        .option('--dry-run', 'Preview what would happen without executing')
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
        .option('--dry-run', 'Preview what would happen without executing')
        .action((ref, options) => {
            if (!ref) {
                uncompleteCmd.help()
                return
            }
            return uncompleteTask(ref, options)
        })

    const deleteCmd = task
        .command('delete [ref]')
        .description('Delete a task')
        .option('--yes', 'Confirm deletion')
        .option('--dry-run', 'Preview what would happen without executing')
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
        .addOption(
            withCaseInsensitiveChoices(
                new Option('--priority <p1-p4>', 'Priority level'),
                PRIORITY_CHOICES,
            ),
        )
        .option('--project <name>', 'Project name or id:xxx')
        .option('--section <ref>', 'Section (name with --project, or id:xxx)')
        .option('--labels <a,b>', 'Comma-separated labels')
        .option('--parent <ref>', 'Parent task reference')
        .option('--description <text>', 'Task description')
        .option('--stdin', 'Read task description from stdin')
        .option('--assignee <ref>', 'Assign to user (name, email, id:xxx, or "me")')
        .option('--duration <time>', 'Duration (e.g., 30m, 1h, 2h15m)')
        .option('--uncompletable', 'Mark task as non-completable (reference/header task)')
        .option('--order <number>', 'Task position within project/parent (0 = top)', (val) => {
            const n = Number(val)
            if (!Number.isInteger(n) || n < 0) {
                throw new Error(
                    formatError('INVALID_ORDER', `Invalid order value: "${val}"`, [
                        'Order must be a non-negative integer (e.g., 0 for top of list)',
                    ]),
                )
            }
            return n
        })
        .option('--json', 'Output the created task as JSON')
        .option('--dry-run', 'Preview what would happen without executing')
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
        .addOption(
            withCaseInsensitiveChoices(
                new Option('--priority <p1-p4>', 'New priority'),
                PRIORITY_CHOICES,
            ),
        )
        .option('--labels <a,b>', 'New labels (replaces existing)')
        .option('--description <text>', 'New description')
        .option('--stdin', 'Read task description from stdin')
        .option('--assignee <ref>', 'Assign to user (name, email, id:xxx, or "me")')
        .option('--unassign', 'Remove assignee')
        .option('--duration <time>', 'Duration (e.g., 30m, 1h, 2h15m)')
        .option('--uncompletable', 'Mark task as non-completable')
        .option('--completable', 'Revert task to completable (undoes --uncompletable)')
        .option('--order <number>', 'Task position within project/parent (0 = top)', (val) => {
            const n = Number(val)
            if (!Number.isInteger(n) || n < 0) {
                throw new Error(
                    formatError('INVALID_ORDER', `Invalid order value: "${val}"`, [
                        'Order must be a non-negative integer (e.g., 0 for top of list)',
                    ]),
                )
            }
            return n
        })
        .option('--json', 'Output the updated task as JSON')
        .option('--dry-run', 'Preview what would happen without executing')
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
        .option('--dry-run', 'Preview what would happen without executing')
        .action((ref, options) => {
            if (!ref) {
                moveCmd.help()
                return
            }
            return moveTask(ref, options)
        })

    const rescheduleCmd = task
        .command('reschedule [ref] [date]')
        .description('Reschedule a task (preserves recurrence)')
        .option('--json', 'Output the rescheduled task as JSON')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((ref, date, options) => {
            if (!ref || !date) {
                rescheduleCmd.help()
                return
            }
            return rescheduleTask(ref, date, options)
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
