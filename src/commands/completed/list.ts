import chalk from 'chalk'
import { getApi, type Project, type Task } from '../../lib/api/core.js'
import { CollaboratorCache, formatAssignee } from '../../lib/collaborators.js'
import { CliError } from '../../lib/errors.js'
import type { PaginatedViewOptions } from '../../lib/options.js'
import {
    formatNextCursorFooter,
    formatPaginatedJson,
    formatPaginatedNdjson,
    formatTaskRow,
} from '../../lib/output.js'
import { LIMITS, paginate } from '../../lib/pagination.js'
import { resolveProjectId } from '../../lib/refs.js'

interface CompletedListOptions extends PaginatedViewOptions {
    since?: string
    until?: string
    project?: string
    search?: string
}

function getLocalDate(daysOffset = 0): string {
    const date = new Date()
    date.setDate(date.getDate() + daysOffset)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export async function listCompleted(options: CompletedListOptions): Promise<void> {
    if (options.search && (options.since || options.until || options.project)) {
        throw new CliError(
            'CONFLICTING_OPTIONS',
            'Cannot use --since, --until, or --project with --search',
        )
    }

    const api = await getApi()

    const targetLimit = options.all
        ? Number.MAX_SAFE_INTEGER
        : options.limit
          ? parseInt(options.limit, 10)
          : LIMITS.tasks

    const since = options.search ? undefined : (options.since ?? getLocalDate(0))
    const until = options.search ? undefined : (options.until ?? getLocalDate(1))

    let projectId: string | undefined
    if (!options.search && options.project) {
        projectId = await resolveProjectId(api, options.project)
    }

    const { results: tasks, nextCursor } = await paginate(
        async (cursor, limit) => {
            if (options.search) {
                const resp = await api.searchCompletedTasks({
                    query: options.search,
                    cursor: cursor ?? undefined,
                    limit,
                })
                return { results: resp.items, nextCursor: resp.nextCursor }
            }
            const resp = await api.getCompletedTasksByCompletionDate({
                since: since!,
                until: until!,
                projectId,
                cursor: cursor ?? undefined,
                limit,
            })
            return { results: resp.items, nextCursor: resp.nextCursor }
        },
        { limit: targetLimit, startCursor: options.cursor },
    )

    if (tasks.length === 0) {
        if (options.json) {
            console.log(
                formatPaginatedJson(
                    { results: [], nextCursor },
                    'task',
                    options.full,
                    options.showUrls,
                ),
            )
        } else if (options.ndjson) {
            console.log(
                formatPaginatedNdjson(
                    { results: [], nextCursor },
                    'task',
                    options.full,
                    options.showUrls,
                ),
            )
        } else {
            console.log(
                options.search
                    ? 'No matching completed tasks.'
                    : 'No completed tasks in this period.',
            )
            console.log(formatNextCursorFooter(nextCursor))
        }
        return
    }

    const { results: allProjects } = await api.getProjects()
    const projects = new Map<string, Project>(allProjects.map((p) => [p.id, p]))

    const collaboratorCache = new CollaboratorCache()
    await collaboratorCache.preload(api, tasks, projects)

    const getAssigneeName = (task: Task): string | null => {
        return formatAssignee({
            userId: task.responsibleUid,
            projectId: task.projectId,
            projects,
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
                { results: tasksWithAssignee, nextCursor },
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
                { results: tasksWithAssignee, nextCursor },
                'task',
                options.full,
                options.showUrls,
            ),
        )
        return
    }

    const header = options.search
        ? chalk.bold(`Completed (${tasks.length}) - search: "${options.search}"`)
        : chalk.bold(
              `Completed (${tasks.length}) - ${since === until ? since : `${since} to ${until}`}`,
          )
    console.log(header)
    console.log('')

    for (const task of tasks) {
        const projectName = projects.get(task.projectId)?.name
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
    console.log(formatNextCursorFooter(nextCursor))
}
