import chalk from 'chalk'
import { Command } from 'commander'
import { getApi, getCurrentUserId } from '../lib/api/core.js'
import { CollaboratorCache, formatAssignee } from '../lib/collaborators.js'
import { getLocalDate } from '../lib/dates.js'
import {
    formatNextCursorFooter,
    formatPaginatedJson,
    formatPaginatedNdjson,
    formatTaskRow,
} from '../lib/output.js'
import { LIMITS, paginate } from '../lib/pagination.js'
import { filterByWorkspaceOrPersonal } from '../lib/task-list.js'

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
        .action(async (options: TodayOptions) => {
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

            const overdue = filteredTasks.filter((t) => t.due && t.due.date < today)
            const dueToday = filteredTasks.filter((t) => t.due?.date === today)
            const allTodayTasks = [...overdue, ...dueToday]

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
            await collaboratorCache.preload(api, allTodayTasks, filterResult.projects)

            if (overdue.length === 0 && dueToday.length === 0) {
                console.log('No tasks due today.')
                console.log(formatNextCursorFooter(nextCursor))
                return
            }

            const { projects } = filterResult
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
        })
}
