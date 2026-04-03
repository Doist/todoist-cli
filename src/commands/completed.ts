import chalk from 'chalk'
import { Command } from 'commander'
import { getApi, type Project, type Task } from '../lib/api/core.js'
import { CollaboratorCache, formatAssignee } from '../lib/collaborators.js'
import { formatPaginatedJson, formatPaginatedNdjson, formatTaskRow } from '../lib/output.js'
import { resolveProjectId } from '../lib/refs.js'

interface CompletedOptions {
    since?: string
    until?: string
    project?: string
    label?: string
    limit?: string
    offset?: string
    json?: boolean
    ndjson?: boolean
    full?: boolean
    showUrls?: boolean
    annotateNotes?: boolean
    annotateItems?: boolean
}

function getLocalDate(daysOffset = 0): string {
    const date = new Date()
    date.setDate(date.getDate() + daysOffset)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function registerCompletedCommand(program: Command): void {
    program
        .command('completed')
        .description('Show completed tasks')
        .option('--since <date>', 'Start date (YYYY-MM-DD), default: today')
        .option('--until <date>', 'End date (YYYY-MM-DD), default: tomorrow')
        .option('--project <name>', 'Filter by project')
        .option('--label <name>', 'Filter by label name')
        .option('--limit <n>', 'Limit number of results (default: 30, max: 200)')
        .option('--offset <n>', 'Skip first N results (default: 0)')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .option('--show-urls', 'Show web app URLs for each task')
        .option('--annotate-notes', 'Include comment data in response')
        .option('--annotate-items', 'Include task metadata in response')
        .action(async (options: CompletedOptions) => {
            const api = await getApi()

            const since = options.since ?? getLocalDate(0)
            const until = options.until ?? getLocalDate(1)

            let projectId: string | undefined
            if (options.project) {
                projectId = await resolveProjectId(api, options.project)
            }

            const limit = options.limit ? parseInt(options.limit, 10) : 30
            const offset = options.offset ? parseInt(options.offset, 10) : 0

            const resp = await api.getAllCompletedTasks({
                since: new Date(since + 'T00:00:00'),
                until: new Date(until + 'T00:00:00'),
                projectId,
                label: options.label,
                limit,
                offset,
                annotateNotes: options.annotateNotes,
                annotateItems: options.annotateItems,
            })

            const tasks = resp.items
            const inlineProjects = resp.projects as Record<string, Record<string, unknown>>

            if (tasks.length === 0) {
                if (options.json) {
                    console.log(
                        formatPaginatedJson(
                            { results: [], nextCursor: null },
                            'task',
                            options.full,
                            options.showUrls,
                        ),
                    )
                } else if (options.ndjson) {
                    console.log(
                        formatPaginatedNdjson(
                            { results: [], nextCursor: null },
                            'task',
                            options.full,
                            options.showUrls,
                        ),
                    )
                } else {
                    console.log('No completed tasks in this period.')
                }
                return
            }

            // Use inline project data for project names
            const getProjectName = (pid: string): string | undefined =>
                inlineProjects[pid]?.name as string | undefined

            // For collaborator resolution, we still need full Project objects
            // (with isShared/workspaceId) when tasks have assignees
            const hasAssignees = tasks.some((t) => t.responsibleUid)
            let fullProjects: Map<string, Project> | undefined
            let collaboratorCache: CollaboratorCache | undefined

            if (hasAssignees) {
                const { results: allProjects } = await api.getProjects()
                fullProjects = new Map(allProjects.map((p) => [p.id, p]))
                collaboratorCache = new CollaboratorCache()
                await collaboratorCache.preload(api, tasks, fullProjects)
            }

            const getAssigneeName = (task: Task): string | null => {
                if (!fullProjects || !collaboratorCache) return null
                return formatAssignee({
                    userId: task.responsibleUid,
                    projectId: task.projectId,
                    projects: fullProjects,
                    cache: collaboratorCache,
                })
            }

            if (options.json) {
                const tasksWithAssignee = tasks.map((task) => ({
                    ...task,
                    responsibleName: getAssigneeName(task),
                }))
                console.log(
                    formatPaginatedJson(
                        { results: tasksWithAssignee, nextCursor: null },
                        'task',
                        options.full,
                        options.showUrls,
                    ),
                )
                return
            }

            if (options.ndjson) {
                const tasksWithAssignee = tasks.map((task) => ({
                    ...task,
                    responsibleName: getAssigneeName(task),
                }))
                console.log(
                    formatPaginatedNdjson(
                        { results: tasksWithAssignee, nextCursor: null },
                        'task',
                        options.full,
                        options.showUrls,
                    ),
                )
                return
            }

            const dateRange = since === until ? since : `${since} to ${until}`
            console.log(chalk.bold(`Completed (${tasks.length}) - ${dateRange}`))
            console.log('')

            for (const task of tasks) {
                const projectName = getProjectName(task.projectId)
                console.log(
                    formatTaskRow({
                        task,
                        projectName,
                        assignee: getAssigneeName(task) ?? undefined,
                        showUrl: options.showUrls,
                    }),
                )
                console.log('')
            }

            if (tasks.length === limit) {
                const nextOffset = offset + limit
                console.log(
                    chalk.dim(
                        `\n... more items may exist. Use --offset ${nextOffset} to see more.`,
                    ),
                )
            }
        })
}
