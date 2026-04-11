import { isWorkspaceProject } from '@doist/todoist-sdk'
import chalk from 'chalk'
import { getApi, type Project } from '../../lib/api/core.js'
import { fetchWorkspaces, type Workspace } from '../../lib/api/workspaces.js'
import { isAccessible } from '../../lib/global-args.js'
import type { PaginatedViewOptions } from '../../lib/options.js'
import {
    formatNextCursorFooter,
    formatPaginatedJson,
    formatPaginatedNdjson,
} from '../../lib/output.js'
import { LIMITS, paginate } from '../../lib/pagination.js'
import { projectUrl } from '../../lib/urls.js'

type ListOptions = PaginatedViewOptions & { personal?: boolean; search?: string }

export async function listProjects(options: ListOptions): Promise<void> {
    const api = await getApi()

    const targetLimit = options.all
        ? Number.MAX_SAFE_INTEGER
        : options.limit
          ? parseInt(options.limit, 10)
          : LIMITS.projects

    const { results: projects, nextCursor } = await paginate(
        (cursor, limit) =>
            options.search
                ? api.searchProjects({
                      query: options.search,
                      cursor: cursor ?? undefined,
                      limit,
                  })
                : api.getProjects({ cursor: cursor ?? undefined, limit }),
        { limit: targetLimit, startCursor: options.cursor },
    )

    if (options.json) {
        console.log(
            formatPaginatedJson(
                { results: projects, nextCursor },
                'project',
                options.full,
                options.showUrls,
            ),
        )
        return
    }

    if (options.ndjson) {
        console.log(
            formatPaginatedNdjson(
                { results: projects, nextCursor },
                'project',
                options.full,
                options.showUrls,
            ),
        )
        return
    }

    if (options.search && projects.length === 0) {
        console.log('No matching projects.')
        return
    }

    if (options.personal) {
        const personalOnly = projects.filter((p) => !isWorkspaceProject(p))
        for (const project of personalOnly) {
            const id = chalk.dim(project.id)
            let name = project.isFavorite
                ? chalk.yellow(`${project.name}${isAccessible() ? ' ★' : ''}`)
                : project.name
            if (project.isShared) {
                name = `${name} ${chalk.dim('[shared]')}`
            }
            console.log(`${id}  ${name}`)
            if (options.showUrls) {
                console.log(`  ${chalk.dim(projectUrl(project.id))}`)
            }
        }
        console.log(formatNextCursorFooter(nextCursor))
        return
    }

    const workspaceProjects = new Map<string, Project[]>()
    const personalProjects: Project[] = []

    for (const project of projects) {
        if (isWorkspaceProject(project)) {
            const list = workspaceProjects.get(project.workspaceId) || []
            list.push(project)
            workspaceProjects.set(project.workspaceId, list)
        } else {
            personalProjects.push(project)
        }
    }

    let workspaces: Workspace[] = []
    if (workspaceProjects.size > 0) {
        workspaces = await fetchWorkspaces()
    }
    const workspaceMap = new Map(workspaces.map((w) => [w.id, w]))

    if (personalProjects.length > 0) {
        if (workspaceProjects.size > 0) {
            console.log(chalk.bold('Personal'))
        }
        for (const project of personalProjects) {
            const id = chalk.dim(project.id)
            let name = project.isFavorite
                ? chalk.yellow(`${project.name}${isAccessible() ? ' ★' : ''}`)
                : project.name
            if (project.isShared) {
                name = `${name} ${chalk.dim('[shared]')}`
            }
            const indent = workspaceProjects.size > 0 ? '  ' : ''
            console.log(`${indent}${id}  ${name}`)
            if (options.showUrls) {
                console.log(`${indent}  ${chalk.dim(projectUrl(project.id))}`)
            }
        }
        if (workspaceProjects.size > 0) {
            console.log('')
        }
    }

    const sortedWorkspaceIds = [...workspaceProjects.keys()].sort((a, b) => {
        const nameA = workspaceMap.get(a)?.name ?? ''
        const nameB = workspaceMap.get(b)?.name ?? ''
        return nameA.localeCompare(nameB)
    })

    for (const workspaceId of sortedWorkspaceIds) {
        const wprojects = workspaceProjects.get(workspaceId)
        if (!wprojects) continue // Should not happen since workspaceId comes from keys()
        const workspace = workspaceMap.get(workspaceId)
        const workspaceName = workspace?.name ?? `Workspace ${workspaceId}`
        console.log(chalk.bold(workspaceName))
        for (const project of wprojects) {
            const id = chalk.dim(project.id)
            const name = project.isFavorite
                ? chalk.yellow(`${project.name}${isAccessible() ? ' ★' : ''}`)
                : project.name
            console.log(`  ${id}  ${name}`)
            if (options.showUrls) {
                console.log(`    ${chalk.dim(projectUrl(project.id))}`)
            }
        }
        console.log('')
    }
    console.log(formatNextCursorFooter(nextCursor))

    if (sortedWorkspaceIds.length > 0) {
        console.log(
            chalk.dim('Tip: Use `td workspace projects <name>` for a detailed view with folders.'),
        )
    }
}
