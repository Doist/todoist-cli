import chalk from 'chalk'
import { Command } from 'commander'
import { getApi, getCurrentUserId, type Task } from '../lib/api/core.js'
import { CollaboratorCache, formatAssignee } from '../lib/collaborators.js'
import { formatDateHeader, getLocalDate, isDueBefore } from '../lib/dates.js'
import {
    formatNextCursorFooter,
    formatPaginatedJson,
    formatPaginatedNdjson,
    formatTaskRow,
} from '../lib/output.js'
import { LIMITS, paginate } from '../lib/pagination.js'
import { filterByWorkspaceOrPersonal } from '../lib/task-list.js'

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
        .action(async (daysArg: string | undefined, options: UpcomingOptions) => {
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

            const { results: tasks, nextCursor } = await paginate(
                (cursor, limit) => api.getTasks({ cursor: cursor ?? undefined, limit }),
                { limit: targetLimit, startCursor: options.cursor },
            )

            const today = getLocalDate(0)
            const endDate = getLocalDate(days)

            let filteredTasks = tasks
            if (!options.anyAssignee) {
                const currentUserId = await getCurrentUserId()
                filteredTasks = tasks.filter(
                    (t) => !t.responsibleUid || t.responsibleUid === currentUserId,
                )
            }

            const filterResult = await filterByWorkspaceOrPersonal(
                api,
                filteredTasks,
                options.workspace,
                options.personal,
            )
            filteredTasks = filterResult.tasks

            const relevantTasks = filteredTasks.filter(
                (t) => t.due && isDueBefore(t.due.date, endDate),
            )

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

            const { projects } = filterResult
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
        })
}
