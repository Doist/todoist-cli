import { getApi } from '../../lib/api/core.js'
import { isQuiet, printDryRun } from '../../lib/output.js'
import { resolveProjectRef } from '../../lib/refs.js'

export async function archiveProject(ref: string, options: { dryRun?: boolean }): Promise<void> {
    const api = await getApi()
    const project = await resolveProjectRef(api, ref)

    if (project.isArchived) {
        console.log('Project already archived.')
        return
    }

    if (options.dryRun) {
        printDryRun('archive project', { Project: project.name })
        return
    }

    await api.archiveProject(project.id)
    if (!isQuiet()) console.log(`Archived: ${project.name} (id:${project.id})`)
}
