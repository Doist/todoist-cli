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
    const workspace = await api.getWorkspace(project.workspaceId)

    if (options.json) {
        console.log(JSON.stringify({ ...response, workspace }, null, 2))
        return
    }

    console.log(`Joined: ${project.name}`)
    console.log(chalk.dim(`Workspace: ${workspace.name}`))
}
