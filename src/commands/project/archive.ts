import { getApi } from '../../lib/api/core.js'
import { printDryRun } from '../../lib/output.js'
import { resolveProjectRef } from '../../lib/refs.js'

export async function archiveProject(ref: string, options: { dryRun?: boolean }): Promise<void> {
    const api = await getApi()
    const project = await resolveProjectRef(api, ref)

    if (options.dryRun) {
        printDryRun('archive project', { Project: project.name })
        return
    }

    await api.archiveProject(project.id)
    console.log(`Archived: ${project.name}`)
}
