import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { printDryRun } from '../../lib/output.js'
import { lenientIdRef } from '../../lib/refs.js'

export async function joinProjectCmd(
    ref: string,
    options: { json?: boolean; dryRun?: boolean },
): Promise<void> {
    const id = lenientIdRef(ref, 'project')

    if (options.dryRun) {
        printDryRun('join project', { ID: id })
        return
    }

    const api = await getApi()
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
