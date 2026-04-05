import { getApi } from '../../lib/api/core.js'
import { isQuiet, printDryRun } from '../../lib/output.js'
import { resolveTaskRef } from '../../lib/refs.js'

export async function uncompleteTask(ref: string, options: { dryRun?: boolean }): Promise<void> {
    const api = await getApi()
    const task = await resolveTaskRef(api, ref)

    if (!task.checked) {
        console.log('Task is not completed.')
        return
    }

    if (options.dryRun) {
        printDryRun('reopen task', { Task: task.content })
        return
    }

    await api.reopenTask(task.id)
    if (!isQuiet()) console.log(`Reopened: ${task.content} (id:${task.id})`)
}
