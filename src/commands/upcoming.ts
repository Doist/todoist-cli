import chalk from 'chalk'
import { Command } from 'commander'
import { getApi, type Project, type Task } from '../lib/api/core.js'
import { CollaboratorCache, formatAssignee } from '../lib/collaborators.js'
import { formatDateHeader, getLocalDate, isDueBefore } from '../lib/dates.js'
import {
    formatNextCursorFooter,
    formatPaginatedJson,
    formatPaginatedNdjson,
    formatTaskRow,
} from '../lib/output.js'
import { LIMITS, paginate } from '../lib/pagination.js'
import { ensureFresh, getCachedCurrentUserId } from '../lib/sync/engine.js'
import { fetchProjects, filterByWorkspaceOrPersonal } from '../lib/task-list.js'

interface UpcomingOptions {
    limit?: string
    cursor?: string
    all?: boolean
    anyAssignee?: boolean
    workspace?: string
    personal?: boolean
    json?: boolean
    ndjson?: boolean
    full?: boolean
    showUrls?: boolean
}

function parseLocalCursor(cursor: string | undefined): number {
    if (!cursor) return 0
    if (cursor.startsWith('local:')) {
        const parsed = Number.parseInt(cursor.slice(6), 10)
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
    }
    const parsed = Number.parseInt(cursor, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function formatLocalCursor(offset: number): string {
    return `local:${offset}`
}

export async function showUpcoming(
    daysArg: string | undefined,
    options: UpcomingOptions,
): Promise<void> {
    const days = daysArg ? parseInt(daysArg, 10) : 7
    if (Number.isNaN(days) || days < 1) {
        console.error('Days must be a positive number')
        process.exitCode = 1
        return
    }

    const api = await getApi()

    const targetLimit = options.all
        ? Number.MAX_SAFE_INTEGER
        : options.limit
          ? parseInt(options.limit, 10)
          : LIMITS.tasks

    const today = getLocalDate(0)
    let relevantTasks: Task[]
    let nextCursor: string | null
    let projects: Map<string, Project>

    const repo = await ensureFresh(['items', 'projects'])
    const cachedCurrentUserId = options.anyAssignee ? null : await getCachedCurrentUserId()
    if (repo && (options.anyAssignee || cachedCurrentUserId)) {
        const upperBound = getLocalDate(days - 1)
        let scopedTasks = (await repo.listTasks()).filter((task) => {
            const dueDate = task.due?.date?.split('T')[0]
            if (!dueDate) return false
            return dueDate <= upperBound
        })

        if (!options.anyAssignee && cachedCurrentUserId) {
            scopedTasks = scopedTasks.filter(
                (task) => task.responsibleUid === cachedCurrentUserId || !task.responsibleUid,
            )
        }

        const cachedProjects = await repo.listProjects()
        projects = new Map(cachedProjects.map((project) => [project.id, project]))
        const filtered = await filterByWorkspaceOrPersonal({
            api,
            tasks: scopedTasks,
            workspace: options.workspace,
            personal: options.personal,
            prefetchedProjects: projects,
        })

        const start = parseLocalCursor(options.cursor)
        relevantTasks = filtered.tasks.slice(start, start + targetLimit)
        nextCursor =
            start + targetLimit < filtered.tasks.length
                ? formatLocalCursor(start + targetLimit)
                : null
    } else {
        const baseQuery = `due before: ${days} days`
        const query = options.anyAssignee
            ? baseQuery
            : `(${baseQuery}) & (assigned to: me | !assigned)`

        const [{ results: tasks, nextCursor: cursor }, prefetchedProjects] = await Promise.all([
            paginate(
                (cursor, limit) =>
                    api.getTasksByFilter({
                        query,
                        cursor: cursor ?? undefined,
                        limit,
                    }),
                { limit: targetLimit, startCursor: options.cursor },
            ),
            fetchProjects(api),
        ])
        projects = prefetchedProjects

        const filterResult = await filterByWorkspaceOrPersonal({
            api,
            tasks,
            workspace: options.workspace,
            personal: options.personal,
            prefetchedProjects: projects,
        })
        relevantTasks = filterResult.tasks
        nextCursor = cursor
    }

    if (options.json) {
        console.log(
            formatPaginatedJson(
                { results: relevantTasks, nextCursor },
                'task',
                options.full,
                options.showUrls,
            ),
        )
        return
    }

    if (options.ndjson) {
        console.log(
            formatPaginatedNdjson(
                { results: relevantTasks, nextCursor },
                'task',
                options.full,
                options.showUrls,
            ),
        )
        return
    }

    const collaboratorCache = new CollaboratorCache()
    await collaboratorCache.preload(api, relevantTasks, projects)

    if (relevantTasks.length === 0) {
        console.log(`No tasks due in the next ${days} day${days === 1 ? '' : 's'}.`)
        console.log(formatNextCursorFooter(nextCursor))
        return
    }

    const overdue: Task[] = []
    const byDate = new Map<string, Task[]>()

    for (const task of relevantTasks) {
        const dueDate = task.due?.date
        if (!dueDate) continue // Skip tasks without due dates
        if (isDueBefore(dueDate, today)) {
            overdue.push(task)
        } else {
            const list = byDate.get(dueDate) || []
            list.push(task)
            byDate.set(dueDate, list)
        }
    }

    if (overdue.length > 0) {
        console.log(chalk.red.bold(`Overdue (${overdue.length})`))
        for (const task of overdue) {
            const assignee = formatAssignee({
                userId: task.responsibleUid,
                projectId: task.projectId,
                projects,
                cache: collaboratorCache,
            })
            console.log(
                formatTaskRow({
                    task,
                    projectName: projects.get(task.projectId)?.name,
                    assignee: assignee ?? undefined,
                    showUrl: options.showUrls,
                }),
            )
            console.log('')
        }
    }

    const sortedDates = Array.from(byDate.keys()).sort()
    for (const date of sortedDates) {
        const dateTasks = byDate.get(date)
        if (!dateTasks) continue // Should not happen since date comes from keys()
        const header = formatDateHeader(date, today)
        console.log(chalk.bold(`${header} (${dateTasks.length})`))
        for (const task of dateTasks) {
            const assignee = formatAssignee({
                userId: task.responsibleUid,
                projectId: task.projectId,
                projects,
                cache: collaboratorCache,
            })
            console.log(
                formatTaskRow({
                    task,
                    projectName: projects.get(task.projectId)?.name,
                    assignee: assignee ?? undefined,
                    showUrl: options.showUrls,
                }),
            )
            console.log('')
        }
    }

    console.log(formatNextCursorFooter(nextCursor))
}

export function registerUpcomingCommand(program: Command): void {
    program
        .command('upcoming [days]')
        .description('Show tasks due in the next N days (default: 7)')
        .option('--limit <n>', 'Limit number of results (default: 300)')
        .option('--cursor <cursor>', 'Continue from cursor')
        .option('--all', 'Fetch all results (no limit)')
        .option('--any-assignee', 'Show tasks assigned to anyone (default: only me/unassigned)')
        .option('--workspace <name>', 'Filter to tasks in workspace')
        .option('--personal', 'Filter to tasks in personal projects')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .option('--show-urls', 'Show web app URLs for each task')
        .action(showUpcoming)
}
