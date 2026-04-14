import chalk from 'chalk'
import { Command } from 'commander'
import { getApi, type Project } from '../lib/api/core.js'
import { fetchCompletedTasksForGoal } from '../lib/api/goal-tasks.js'
import { CollaboratorCache, formatAssignee } from '../lib/collaborators.js'
import { isAccessible } from '../lib/global-args.js'
import type { PaginatedViewOptions } from '../lib/options.js'
import {
    formatJson,
    formatNextCursorFooter,
    formatPaginatedJson,
    formatPaginatedNdjson,
    formatProgressBar,
    formatTaskRow,
    printDryRun,
} from '../lib/output.js'
import { LIMITS, paginate } from '../lib/pagination.js'
import { resolveGoalRef } from '../lib/refs.js'
import { resolveWorkspaceRef } from '../lib/refs.js'
import { resolveTaskRef } from '../lib/refs.js'

function formatOwnerType(ownerType: string): string {
    return ownerType === 'WORKSPACE' ? 'Workspace' : 'User'
}

// ── List ──

async function listGoals(options: PaginatedViewOptions & { workspace?: string }): Promise<void> {
    const api = await getApi()

    const targetLimit = options.all
        ? Number.MAX_SAFE_INTEGER
        : options.limit
          ? parseInt(options.limit, 10)
          : LIMITS.goals

    let workspaceId: string | undefined
    if (options.workspace) {
        const ws = await resolveWorkspaceRef(options.workspace)
        workspaceId = String(ws.id)
    }

    const { results: goals, nextCursor } = await paginate(
        (cursor, limit) =>
            api.getGoals({
                ownerType: workspaceId ? 'WORKSPACE' : undefined,
                workspaceId,
                cursor: cursor ?? undefined,
                limit,
            }),
        { limit: targetLimit },
    )

    if (options.json) {
        console.log(formatPaginatedJson({ results: goals, nextCursor }, 'goal', options.full))
        return
    }

    if (options.ndjson) {
        console.log(formatPaginatedNdjson({ results: goals, nextCursor }, 'goal', options.full))
        return
    }

    if (goals.length === 0) {
        console.log('No goals found.')
        return
    }

    for (const goal of goals) {
        const id = chalk.dim(goal.id.slice(0, 8))
        const name = goal.isCompleted ? chalk.strikethrough(goal.name) : goal.name
        const progress = formatProgressBar(goal.progress?.percentage ?? 0, 10)
        const deadline = goal.isCompleted
            ? chalk.dim('completed')
            : goal.deadline
              ? chalk.green(goal.deadline)
              : ''
        console.log(`${id}  ${name}  ${progress}  ${deadline}`)
    }
    console.log(formatNextCursorFooter(nextCursor))
}

// ── View ──

type ViewGoalOptions = PaginatedViewOptions & { includeCompleted?: boolean }

async function viewGoal(ref: string, options: ViewGoalOptions): Promise<void> {
    const api = await getApi()
    const goal = await resolveGoalRef(api, ref)

    const targetLimit = options.all
        ? Number.MAX_SAFE_INTEGER
        : options.limit
          ? parseInt(options.limit, 10)
          : LIMITS.tasks

    const { results: openTasks, nextCursor } = await paginate(
        (cursor, limit) => api.getTasks({ goalId: goal.id, cursor: cursor ?? undefined, limit }),
        { limit: targetLimit },
    )

    // The REST `/tasks?goal_id=…` endpoint only returns *open* tasks, so for
    // goals with completed work those items are silently missing. Opt in to
    // the (more expensive) completed-task walk with `--include-completed`.
    let completedTasks: typeof openTasks = []
    let completedTruncated = false
    let completedLimitReached = false
    if (options.includeCompleted) {
        const remaining = targetLimit - openTasks.length
        if (remaining > 0) {
            const {
                tasks: fetched,
                truncated,
                limitReached,
            } = await fetchCompletedTasksForGoal({
                goalId: goal.id,
                limit: remaining,
                expectedCount: goal.progress?.completedTaskCount,
            })
            completedTasks = fetched
            completedTruncated = truncated
            completedLimitReached = limitReached
        } else if ((goal.progress?.completedTaskCount ?? 0) > 0) {
            // The open-task page already saturated `--limit`, so we never
            // even asked for completed tasks — surface that gap too.
            completedLimitReached = true
        }
    }

    const tasks = [...openTasks, ...completedTasks]

    if (options.json) {
        const goalJson = JSON.parse(formatJson(goal, 'goal', options.full))
        const tasksJson = JSON.parse(
            formatPaginatedJson({ results: tasks, nextCursor }, 'task', options.full),
        )
        const payload: Record<string, unknown> = { goal: goalJson, tasks: tasksJson }
        if (options.includeCompleted) {
            payload.completedTaskCount = completedTasks.length
            payload.completedTasksTruncated = completedTruncated
            payload.completedTasksLimitReached = completedLimitReached
        }
        console.log(JSON.stringify(payload, null, 2))
        return
    }

    if (options.ndjson) {
        console.log(
            JSON.stringify({
                _type: 'goal',
                ...JSON.parse(formatJson(goal, 'goal', options.full)),
            }),
        )
        console.log(formatPaginatedNdjson({ results: tasks, nextCursor }, 'task', options.full))
        return
    }

    // Header
    console.log(chalk.bold(goal.name))
    console.log(chalk.dim(`ID:       ${goal.id}`))
    console.log(chalk.dim(`Owner:    ${formatOwnerType(goal.ownerType)}`))
    if (goal.description) console.log(`Desc:     ${goal.description}`)
    if (goal.deadline) console.log(`Deadline: ${chalk.green(goal.deadline)}`)
    console.log(
        `Progress: ${formatProgressBar(goal.progress?.percentage ?? 0)} (${goal.progress?.completedTaskCount ?? 0}/${goal.progress?.totalTaskCount ?? 0})`,
    )
    if (goal.isCompleted) {
        console.log(chalk.green(isAccessible() ? 'Goal completed' : '✓ Completed'))
    }
    console.log('')

    const printCompletedWarnings = () => {
        if (completedTruncated) {
            console.log(
                chalk.yellow(
                    'Note: some completed tasks are older than the lookback window and were not fetched.',
                ),
            )
        }
        if (completedLimitReached) {
            console.log(
                chalk.yellow(
                    'Note: results were capped by --limit; additional completed tasks exist. Raise --limit or use --all to see them.',
                ),
            )
        }
    }

    if (tasks.length === 0) {
        console.log('No linked tasks.')
        printCompletedWarnings()
        console.log(formatNextCursorFooter(nextCursor))
        return
    }

    const { results: projects } = await api.getProjects()
    const projectMap = new Map<string, Project>()
    for (const p of projects) {
        projectMap.set(p.id, p)
    }

    const collaboratorCache = new CollaboratorCache()
    await collaboratorCache.preload(api, tasks, projectMap)

    for (const task of tasks) {
        const assignee = formatAssignee({
            userId: task.responsibleUid,
            projectId: task.projectId,
            projects: projectMap,
            cache: collaboratorCache,
        })
        console.log(
            formatTaskRow({
                task,
                projectName: projectMap.get(task.projectId)?.name,
                assignee: assignee ?? undefined,
            }),
        )
        console.log('')
    }
    printCompletedWarnings()
    console.log(formatNextCursorFooter(nextCursor))
}

// ── Create ──

interface CreateOptions {
    name: string
    workspace?: string
    description?: string
    deadline?: string
    responsible?: string
    json?: boolean
    dryRun?: boolean
}

async function createGoal(options: CreateOptions): Promise<void> {
    if (options.dryRun) {
        printDryRun('create goal', {
            Name: options.name,
            Workspace: options.workspace,
            Description: options.description,
            Deadline: options.deadline,
            Responsible: options.responsible,
        })
        return
    }

    const api = await getApi()

    let workspaceId: string | undefined
    if (options.workspace) {
        const ws = await resolveWorkspaceRef(options.workspace)
        workspaceId = String(ws.id)
    }

    const goal = await api.addGoal({
        name: options.name,
        workspaceId,
        description: options.description ?? null,
        deadline: options.deadline ?? null,
        responsibleUid: options.responsible ?? null,
    })

    if (options.json) {
        console.log(formatJson(goal, 'goal'))
        return
    }

    console.log(`Created: ${goal.name}`)
    console.log(chalk.dim(`ID: ${goal.id}`))
}

// ── Update ──

interface UpdateOptions {
    name?: string
    description?: string
    deadline?: string
    responsible?: string
    json?: boolean
    dryRun?: boolean
}

async function updateGoal(ref: string, options: UpdateOptions): Promise<void> {
    const { name, description, deadline, responsible, json, dryRun } = options

    if (!name && !description && !deadline && !responsible) {
        throw new Error(
            'No update fields specified. Use --name, --description, --deadline, or --responsible.',
        )
    }

    if (dryRun) {
        printDryRun('update goal', {
            Ref: ref,
            Name: name,
            Description: description,
            Deadline: deadline,
            Responsible: responsible,
        })
        return
    }

    const api = await getApi()
    const goal = await resolveGoalRef(api, ref)

    const args: Record<string, string | null | undefined> = {}
    if (name) args.name = name
    if (description) args.description = description
    if (deadline) args.deadline = deadline
    if (responsible) args.responsibleUid = responsible

    const updated = await api.updateGoal(goal.id, args)

    if (json) {
        console.log(formatJson(updated, 'goal'))
        return
    }

    console.log(`Updated: ${goal.name} → ${updated.name}`)
}

// ── Delete ──

async function deleteGoal(
    ref: string,
    options: { yes?: boolean; dryRun?: boolean },
): Promise<void> {
    const api = await getApi()
    const goal = await resolveGoalRef(api, ref)

    if (options.dryRun) {
        printDryRun('delete goal', { Goal: goal.name })
        return
    }

    if (!options.yes) {
        console.log(`Would delete goal: ${goal.name}`)
        console.log('Use --yes to confirm.')
        return
    }

    await api.deleteGoal(goal.id)
    console.log(`Deleted goal: ${goal.name}`)
}

// ── Complete / Uncomplete ──

async function completeGoal(ref: string): Promise<void> {
    const api = await getApi()
    const goal = await resolveGoalRef(api, ref)
    await api.completeGoal(goal.id)
    console.log(`Completed: ${goal.name}`)
}

async function uncompleteGoal(ref: string): Promise<void> {
    const api = await getApi()
    const goal = await resolveGoalRef(api, ref)
    await api.uncompleteGoal(goal.id)
    console.log(`Reopened: ${goal.name}`)
}

// ── Link / Unlink ──

async function linkGoal(ref: string, options: { task: string }): Promise<void> {
    const api = await getApi()
    const goal = await resolveGoalRef(api, ref)
    const task = await resolveTaskRef(api, options.task)

    await api.linkTaskToGoal({ goalId: goal.id, taskId: task.id })
    console.log(`Linked task "${task.content}" to goal "${goal.name}"`)
}

async function unlinkGoal(ref: string, options: { task: string }): Promise<void> {
    const api = await getApi()
    const goal = await resolveGoalRef(api, ref)
    const task = await resolveTaskRef(api, options.task)

    await api.unlinkTaskFromGoal({ goalId: goal.id, taskId: task.id })
    console.log(`Unlinked task "${task.content}" from goal "${goal.name}"`)
}

// ── Register ──

export function registerGoalCommand(program: Command): void {
    const goal = program.command('goal').description('Manage goals')

    goal.command('view [ref]', { isDefault: true })
        .description('View goal details and linked tasks')
        .option('--limit <n>', 'Limit number of results (default: 300)')
        .option('--all', 'Fetch all open linked tasks (no limit)')
        .option(
            '--include-completed',
            'Also fetch completed linked tasks (slower; makes multiple API calls)',
        )
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .action((ref, options) => {
            if (!ref) {
                goal.help()
                return
            }
            return viewGoal(ref, options)
        })

    goal.command('list')
        .description('List all accessible goals')
        .option('--workspace <ref>', 'Filter to a workspace')
        .option('--limit <n>', 'Limit number of results (default: 200)')
        .option('--all', 'Fetch all results (no limit)')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .action(listGoals)

    const createCmd = goal
        .command('create')
        .description('Create a goal')
        .option('--name <name>', 'Goal name (required)')
        .option('--workspace <ref>', 'Workspace (omit for personal goal)')
        .option('--description <desc>', 'Goal description')
        .option('--deadline <date>', 'Target date (YYYY-MM-DD)')
        .option('--responsible <uid>', 'Responsible user ID')
        .option('--json', 'Output the created goal as JSON')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((options) => {
            if (!options.name) {
                createCmd.help()
                return
            }
            return createGoal(options)
        })

    const updateCmd = goal
        .command('update [ref]')
        .description('Update a goal')
        .option('--name <name>', 'New name')
        .option('--description <desc>', 'New description')
        .option('--deadline <date>', 'New deadline (YYYY-MM-DD)')
        .option('--responsible <uid>', 'New responsible user ID')
        .option('--json', 'Output the updated goal as JSON')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((ref, options) => {
            if (!ref) {
                updateCmd.help()
                return
            }
            return updateGoal(ref, options)
        })

    const deleteCmd = goal
        .command('delete [ref]')
        .description('Delete a goal')
        .option('--yes', 'Confirm deletion')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((ref, options) => {
            if (!ref) {
                deleteCmd.help()
                return
            }
            return deleteGoal(ref, options)
        })

    const completeCmd = goal
        .command('complete [ref]')
        .description('Mark a goal as completed')
        .action((ref) => {
            if (!ref) {
                completeCmd.help()
                return
            }
            return completeGoal(ref)
        })

    const uncompleteCmd = goal
        .command('uncomplete [ref]')
        .description('Reopen a completed goal')
        .action((ref) => {
            if (!ref) {
                uncompleteCmd.help()
                return
            }
            return uncompleteGoal(ref)
        })

    const linkCmd = goal
        .command('link [ref]')
        .description('Link a task to a goal')
        .option('--task <ref>', 'Task to link (required)')
        .action((ref, options) => {
            if (!ref || !options.task) {
                linkCmd.help()
                return
            }
            return linkGoal(ref, options)
        })

    const unlinkCmd = goal
        .command('unlink [ref]')
        .description('Unlink a task from a goal')
        .option('--task <ref>', 'Task to unlink (required)')
        .action((ref, options) => {
            if (!ref || !options.task) {
                unlinkCmd.help()
                return
            }
            return unlinkGoal(ref, options)
        })
}
