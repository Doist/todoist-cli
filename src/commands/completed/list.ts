import type { TodoistApi } from '@doist/todoist-sdk'
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
    label?: string
    offset?: string
    search?: string
    annotateNotes?: boolean
    annotateItems?: boolean
}

function getLocalDate(daysOffset = 0): string {
    const date = new Date()
    date.setDate(date.getDate() + daysOffset)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export async function listCompleted(options: CompletedListOptions): Promise<void> {
    const isSearch = options.search !== undefined

    if (isSearch && !options.search) {
        throw new CliError('INVALID_SEARCH', 'Search query cannot be empty')
    }

    if (isSearch && (options.since || options.until || options.project)) {
        throw new CliError(
            'CONFLICTING_OPTIONS',
            'Cannot use --since, --until, or --project with --search',
        )
    }

    const api = await getApi()

    if (isSearch) {
        return listSearchResults(api, options)
    }

    return listByDate(api, options)
}

async function listSearchResults(api: TodoistApi, options: CompletedListOptions): Promise<void> {
    const targetLimit = options.all
        ? Number.MAX_SAFE_INTEGER
        : options.limit
          ? parseInt(options.limit, 10)
          : LIMITS.tasks

    const { results: tasks, nextCursor } = await paginate(
        async (cursor, limit) => {
            const resp = await api.searchCompletedTasks({
                query: options.search!,
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
            console.log('No matching completed tasks.')
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

    console.log(chalk.bold(`Completed (${tasks.length}) - search: "${options.search}"`))
    console.log('')

    for (const task of tasks) {
        const projectName = projects.get(task.projectId)?.name
        console.log(
            await formatTaskRow({
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

async function listByDate(api: TodoistApi, options: CompletedListOptions): Promise<void> {
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
            await formatTaskRow({
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
            chalk.dim(`\n... more items may exist. Use --offset ${nextOffset} to see more.`),
        )
    }
}
