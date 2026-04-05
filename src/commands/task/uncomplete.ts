import { getApi } from '../../lib/api/core.js'
import { isQuiet, printDryRun } from '../../lib/output.js'
import { lenientIdRef } from '../../lib/refs.js'

export async function uncompleteTask(ref: string, options: { dryRun?: boolean }): Promise<void> {
    const id = lenientIdRef(ref, 'task')
    const api = await getApi()
    const task = await api.getTask(id)

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
