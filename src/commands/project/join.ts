import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { printDryRun } from '../../lib/output.js'
import { lenientIdRef } from '../../lib/refs.js'

export async function joinProjectCmd(
    ref: string,
    options: { json?: boolean; dryRun?: boolean },
): Promise<void> {
    const id = lenientIdRef(ref, 'project')

    const api = await getApi()

    if (options.dryRun) {
        let name: string | undefined
        try {
            const project = await api.getProject(id)
            name = project.name
        } catch {
            // May not have access before joining
        }
        printDryRun('join project', { Project: name ?? id })
        return
    }
    const response = await api.joinProject(id)
    const { project } = response
    const workspace = project.workspaceId ? await api.getWorkspace(project.workspaceId) : null

    if (options.json) {
        console.log(JSON.stringify(workspace ? { project, workspace } : { project }, null, 2))
        return
    }

    console.log(`Joined: ${project.name}`)
    if (workspace) {
        console.log(chalk.dim(`Workspace: ${workspace.name}`))
    } else {
        console.log(chalk.dim(`ID: ${project.id}`))
    }
}
