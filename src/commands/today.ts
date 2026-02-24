import chalk from 'chalk'
import { Command } from 'commander'
import { getApi, type Project, type Task } from '../lib/api/core.js'
import { CollaboratorCache, formatAssignee } from '../lib/collaborators.js'
import { getLocalDate, isDueBefore, isDueOnDate } from '../lib/dates.js'
import {
    formatNextCursorFooter,
    formatPaginatedJson,
    formatPaginatedNdjson,
    formatTaskRow,
} from '../lib/output.js'
import { LIMITS, paginate } from '../lib/pagination.js'
import { ensureFresh, getCachedCurrentUserId } from '../lib/sync/engine.js'
import { fetchProjects, filterByWorkspaceOrPersonal } from '../lib/task-list.js'

interface TodayOptions {
    limit?: string
    cursor?: string
    all?: boolean
    anyAssignee?: boolean
    workspace?: string
    personal?: boolean
    json?: boolean
    ndjson?: boolean
    full?: boolean
    raw?: boolean
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

export async function showToday(options: TodayOptions): Promise<void> {
    const api = await getApi()

    const targetLimit = options.all
        ? Number.MAX_SAFE_INTEGER
        : options.limit
          ? parseInt(options.limit, 10)
          : LIMITS.tasks

    const today = getLocalDate(0)
    let allTodayTasks: Task[]
    let nextCursor: string | null
    let projects: Map<string, Project>

    const repo = await ensureFresh(['items', 'projects'])
    const cachedCurrentUserId = options.anyAssignee ? null : await getCachedCurrentUserId()
    if (repo && (options.anyAssignee || cachedCurrentUserId)) {
        const allCachedTasks = await repo.listTasks()
        let scopedTasks = allCachedTasks.filter(
            (task) =>
                task.due &&
                (isDueBefore(task.due.date, today) || isDueOnDate(task.due.date, today)),
        )

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
        const paged = filtered.tasks.slice(start, start + targetLimit)
        allTodayTasks = paged
        nextCursor =
            start + targetLimit < filtered.tasks.length
                ? formatLocalCursor(start + targetLimit)
                : null
    } else {
        const baseQuery = 'today | overdue'
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
        const overdue = filterResult.tasks.filter(
            (task) => task.due && isDueBefore(task.due.date, today),
        )
        const dueToday = filterResult.tasks.filter(
            (task) => task.due && isDueOnDate(task.due.date, today),
        )
        allTodayTasks = [...overdue, ...dueToday]
        nextCursor = cursor
    }

    const overdue = allTodayTasks.filter((task) => task.due && isDueBefore(task.due.date, today))
    const dueToday = allTodayTasks.filter((task) => task.due && isDueOnDate(task.due.date, today))

    if (options.json) {
        console.log(
            formatPaginatedJson(
                { results: allTodayTasks, nextCursor },
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
                { results: allTodayTasks, nextCursor },
                'task',
                options.full,
                options.showUrls,
            ),
        )
        return
    }

    const collaboratorCache = new CollaboratorCache()
    await collaboratorCache.preload(api, allTodayTasks, projects)

    if (overdue.length === 0 && dueToday.length === 0) {
        console.log('No tasks due today.')
        console.log(formatNextCursorFooter(nextCursor))
        return
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
                    raw: options.raw,
                    showUrl: options.showUrls,
                }),
            )
            console.log('')
        }
    }

    console.log(chalk.bold(`Today (${dueToday.length})`))
    for (const task of dueToday) {
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
                raw: options.raw,
                showUrl: options.showUrls,
            }),
        )
        console.log('')
    }
    console.log(formatNextCursorFooter(nextCursor))
}

export function registerTodayCommand(program: Command): void {
    program
        .command('today')
        .description('Show tasks due today and overdue')
        .option('--limit <n>', 'Limit number of results (default: 300)')
        .option('--cursor <cursor>', 'Continue from cursor')
        .option('--all', 'Fetch all results (no limit)')
        .option('--any-assignee', 'Show tasks assigned to anyone (default: only me/unassigned)')
        .option('--workspace <name>', 'Filter to tasks in workspace')
        .option('--personal', 'Filter to tasks in personal projects')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .option('--raw', 'Disable markdown rendering')
        .option('--show-urls', 'Show web app URLs for each task')
        .action(showToday)
}
