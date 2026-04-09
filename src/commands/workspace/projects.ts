import { isWorkspaceProject } from '@doist/todoist-sdk'
import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { fetchWorkspaceFolders } from '../../lib/api/workspaces.js'
import type { PaginatedViewOptions } from '../../lib/options.js'
import { LIMITS, paginate } from '../../lib/pagination.js'
import { resolveWorkspaceRef } from '../../lib/refs.js'

export async function listWorkspaceProjects(
    ref: string,
    options: PaginatedViewOptions,
): Promise<void> {
    const workspace = await resolveWorkspaceRef(ref)
    const api = await getApi()

    const targetLimit = options.all
        ? Number.MAX_SAFE_INTEGER
        : options.limit
          ? parseInt(options.limit, 10)
          : LIMITS.projects

    const { results: allProjectsRaw } = await paginate(
        (cursor, limit) => api.getProjects({ cursor: cursor ?? undefined, limit }),
        { limit: Number.MAX_SAFE_INTEGER, startCursor: options.cursor },
    )

    const workspaceProjects = allProjectsRaw.filter(
        (p) => isWorkspaceProject(p) && p.workspaceId === workspace.id,
    )
    const allProjects = workspaceProjects.slice(0, targetLimit)
    const nextCursor = workspaceProjects.length > targetLimit ? 'has-more' : null

    const folders = await fetchWorkspaceFolders()
    const workspaceFolders = folders.filter((f) => f.workspaceId === workspace.id)
    const folderMap = new Map(workspaceFolders.map((f) => [f.id, f.name]))

    if (options.json) {
        const output = options.full
            ? allProjects
            : allProjects.map((p) => ({
                  id: p.id,
                  name: p.name,
                  folderId: isWorkspaceProject(p) ? p.folderId : null,
                  folderName:
                      isWorkspaceProject(p) && p.folderId ? folderMap.get(p.folderId) : null,
                  status: isWorkspaceProject(p) ? p.status : null,
              }))
        console.log(JSON.stringify({ results: output, nextCursor }, null, 2))
        return
    }

    if (options.ndjson) {
        for (const p of allProjects) {
            const output = options.full
                ? p
                : {
                      id: p.id,
                      name: p.name,
                      folderId: isWorkspaceProject(p) ? p.folderId : null,
                      folderName:
                          isWorkspaceProject(p) && p.folderId ? folderMap.get(p.folderId) : null,
                      status: isWorkspaceProject(p) ? p.status : null,
                  }
            console.log(JSON.stringify(output))
        }
        if (nextCursor) {
            console.log(JSON.stringify({ _meta: true, nextCursor }))
        }
        return
    }

    const projectsByFolder = new Map<string | null, typeof allProjects>()
    for (const project of allProjects) {
        const folderId = isWorkspaceProject(project) ? project.folderId : null
        if (!projectsByFolder.has(folderId)) {
            projectsByFolder.set(folderId, [])
        }
        projectsByFolder.get(folderId)?.push(project)
    }

    const sortedFolderIds = [...projectsByFolder.keys()].sort((a, b) => {
        if (a === null) return 1
        if (b === null) return -1
        const nameA = folderMap.get(a) ?? ''
        const nameB = folderMap.get(b) ?? ''
        return nameA.localeCompare(nameB)
    })

    let isFirst = true
    for (const folderId of sortedFolderIds) {
        const projects = projectsByFolder.get(folderId)
        if (!projects || projects.length === 0) continue

        const folderName = folderId ? folderMap.get(folderId) : null
        const hasHeader = folderName || (folderId === null && projectsByFolder.size > 1)

        if (!isFirst && hasHeader) {
            console.log('')
        }
        isFirst = false

        if (folderName) {
            console.log(chalk.cyan(`${folderName}/`))
        } else if (folderId === null && projectsByFolder.size > 1) {
            console.log(chalk.dim('(no folder)'))
        }

        for (const project of projects) {
            const id = chalk.dim(`id:${project.id}`)
            const name = project.name
            const indent = hasHeader ? '  ' : ''
            console.log(`${indent}${id}  ${name}`)
        }
    }

    if (nextCursor) {
        console.log(chalk.dim(`\n... more items exist. Use --all to fetch everything.`))
    }
}
