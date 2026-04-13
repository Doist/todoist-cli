import chalk from 'chalk'
import { getApi, type Project } from '../../lib/api/core.js'
import { CollaboratorCache, formatAssignee } from '../../lib/collaborators.js'
import { CliError } from '../../lib/errors.js'
import { prerenderMarkdown } from '../../lib/markdown.js'
import type { PaginatedViewOptions } from '../../lib/options.js'
import {
    formatNextCursorFooter,
    formatPaginatedJson,
    formatPaginatedNdjson,
    formatTaskRow,
} from '../../lib/output.js'
import { LIMITS, paginate } from '../../lib/pagination.js'
import { filterUrl } from '../../lib/urls.js'
import { resolveFilterRef } from './helpers.js'

export async function showFilter(nameOrId: string, options: PaginatedViewOptions): Promise<void> {
    const filter = await resolveFilterRef(nameOrId)
    const api = await getApi()

    const targetLimit = options.all
        ? Number.MAX_SAFE_INTEGER
        : options.limit
          ? parseInt(options.limit, 10)
          : LIMITS.tasks

    let tasks: Awaited<ReturnType<typeof api.getTasksByFilter>>['results']
    let nextCursor: string | null

    try {
        const result = await paginate(
            (cursor, limit) =>
                api.getTasksByFilter({
                    query: filter.query,
                    cursor: cursor ?? undefined,
                    limit,
                }),
            { limit: targetLimit, startCursor: options.cursor },
        )
        tasks = result.results
        nextCursor = result.nextCursor
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (message.includes('400')) {
            throw new CliError(
                'INVALID_FILTER_QUERY',
                `Filter query "${filter.query}" is invalid.`,
                ['Check the Todoist filter syntax'],
            )
        }
        throw err
    }

    if (options.json) {
        console.log(
            formatPaginatedJson(
                { results: tasks, nextCursor },
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
                { results: tasks, nextCursor },
                'task',
                options.full,
                options.showUrls,
            ),
        )
        return
    }

    console.log(chalk.bold(`${filter.name}`))
    console.log(chalk.dim(`Query: ${filter.query}`))
    console.log(chalk.dim(`URL:   ${filterUrl(filter.id)}`))
    console.log('')

    if (tasks.length === 0) {
        console.log('No tasks match this filter.')
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

    await prerenderMarkdown(tasks.map((t) => t.content))

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
                showUrl: options.showUrls,
            }),
        )
        console.log('')
    }
    console.log(formatNextCursorFooter(nextCursor))
}
