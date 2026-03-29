import { getApi } from '../../lib/api/core.js'
import { printDryRun } from '../../lib/output.js'
import { resolveTaskRef } from '../../lib/refs.js'

export async function deleteTask(
    ref: string,
    options: { yes?: boolean; dryRun?: boolean },
): Promise<void> {
    const api = await getApi()
    const task = await resolveTaskRef(api, ref)

    if (options.dryRun) {
        printDryRun('delete task', { Task: task.content })
        return
    }

    if (!options.yes) {
        console.log(`Would delete: ${task.content}`)
        console.log('Use --yes to confirm.')
        return
    }

    await api.deleteTask(task.id)
    console.log(`Deleted: ${task.content}`)
}
