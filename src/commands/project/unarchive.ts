import { getApi } from '../../lib/api/core.js'
import { isQuiet } from '../../lib/global-args.js'
import { printDryRun } from '../../lib/output.js'
import { resolveProjectRef } from '../../lib/refs.js'

export async function unarchiveProject(ref: string, options: { dryRun?: boolean }): Promise<void> {
    const api = await getApi()
    const project = await resolveProjectRef(api, ref)

    if (!project.isArchived) {
        console.log('Project is not archived.')
        return
    }

    if (options.dryRun) {
        printDryRun('unarchive project', { Project: project.name })
        return
    }

    await api.unarchiveProject(project.id)
    if (!isQuiet()) console.log(`Unarchived: ${project.name} (id:${project.id})`)
}
