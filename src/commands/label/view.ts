import chalk from 'chalk'
import { getApi, type Project } from '../../lib/api/core.js'
import { CollaboratorCache, formatAssignee } from '../../lib/collaborators.js'
import type { PaginatedViewOptions } from '../../lib/options.js'
import {
    formatNextCursorFooter,
    formatPaginatedJson,
    formatPaginatedNdjson,
    formatTaskRow,
} from '../../lib/output.js'
import { LIMITS, paginate } from '../../lib/pagination.js'
import { labelUrl } from '../../lib/urls.js'
import { resolveLabelNameForView } from './helpers.js'

export async function viewLabel(nameOrId: string, options: PaginatedViewOptions): Promise<void> {
    const resolved = await resolveLabelNameForView(nameOrId)
    const api = await getApi()

    const targetLimit = options.all
        ? Number.MAX_SAFE_INTEGER
        : options.limit
          ? parseInt(options.limit, 10)
          : LIMITS.tasks

    const { results: tasks, nextCursor } = await paginate(
        (cursor, limit) =>
            api.getTasksByFilter({
                query: `@${resolved.name}`,
                cursor: cursor ?? undefined,
                limit,
            }),
        { limit: targetLimit },
    )

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

    console.log(chalk.bold(`@${resolved.name}`))
    if (resolved.label) {
        console.log(chalk.dim(`ID:    ${resolved.label.id}`))
        console.log(chalk.dim(`Color: ${resolved.label.color}`))
        console.log(chalk.dim(`URL:   ${labelUrl(resolved.label.id)}`))
        if (resolved.label.isFavorite) console.log(chalk.yellow('★ Favorite'))
    } else {
        console.log(chalk.dim('Type:  shared label'))
    }
    console.log('')

    if (tasks.length === 0) {
        console.log('No tasks with this label.')
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
                showUrl: options.showUrls,
            }),
        )
        console.log('')
    }
    console.log(formatNextCursorFooter(nextCursor))
}
