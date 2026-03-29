import { getApi } from '../../lib/api/core.js'
import { formatError, printDryRun } from '../../lib/output.js'
import { resolveProjectRef } from '../../lib/refs.js'

export async function deleteProject(
    ref: string,
    options: { yes?: boolean; dryRun?: boolean },
): Promise<void> {
    const api = await getApi()
    const project = await resolveProjectRef(api, ref)

    const { results: tasks } = await api.getTasks({ projectId: project.id })
    if (tasks.length > 0) {
        throw new Error(
            formatError(
                'HAS_TASKS',
                `Cannot delete project: ${tasks.length} uncompleted task${tasks.length === 1 ? '' : 's'} remain.`,
            ),
        )
    }

    if (options.dryRun) {
        printDryRun('delete project', { Project: project.name })
        return
    }

    if (!options.yes) {
        console.log(`Would delete project: ${project.name}`)
        console.log('Use --yes to confirm.')
        return
    }

    await api.deleteProject(project.id)
    console.log(`Deleted project: ${project.name}`)
}
