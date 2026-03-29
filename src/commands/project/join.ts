import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { formatJson, printDryRun } from '../../lib/output.js'
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
    const project = await api.joinProject(id)

    if (options.json) {
        console.log(formatJson(project, 'project'))
        return
    }

    console.log(`Joined: ${project.name}`)
    console.log(chalk.dim(`ID: ${project.id}`))
}
