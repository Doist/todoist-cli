import { isWorkspaceProject } from '@doist/todoist-sdk'
import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { paginate } from '../../lib/pagination.js'
import { resolveWorkspaceRef } from '../../lib/refs.js'
import { resolveFolderByRef } from './helpers.js'

interface ViewFolderOptions {
    workspace?: string
    json?: boolean
    full?: boolean
}

export async function viewFolder(ref: string, options: ViewFolderOptions): Promise<void> {
    const folder = await resolveFolderByRef(ref, options)
    const api = await getApi()

    // Fetch workspace projects and filter to this folder
    const { results: allProjects } = await paginate(
        (cursor, limit) => api.getProjects({ cursor: cursor ?? undefined, limit }),
        { limit: Number.MAX_SAFE_INTEGER },
    )

    const projects = allProjects.filter((p) => isWorkspaceProject(p) && p.folderId === folder.id)

    if (options.json) {
        const output = options.full
            ? { folder, projects }
            : {
                  folder: {
                      id: folder.id,
                      name: folder.name,
                      workspaceId: folder.workspaceId,
                  },
                  projects: projects.map((p) => ({
                      id: p.id,
                      name: p.name,
                  })),
              }
        console.log(JSON.stringify(output, null, 2))
        return
    }

    // Resolve workspace name for display
    let workspaceName: string | undefined
    try {
        const workspace = await resolveWorkspaceRef(`id:${folder.workspaceId}`)
        workspaceName = workspace.name
    } catch {
        // workspace lookup is best-effort for display
    }

    console.log(chalk.bold(folder.name))
    console.log(chalk.dim(`ID:        ${folder.id}`))
    if (workspaceName) {
        console.log(chalk.dim(`Workspace: ${workspaceName}`))
    }
    console.log('')

    if (projects.length === 0) {
        console.log('No projects in this folder.')
        return
    }

    console.log(chalk.dim(`Projects (${projects.length}):`))
    for (const project of projects) {
        const id = chalk.dim(project.id)
        console.log(`  ${id}  ${project.name}`)
    }
}
