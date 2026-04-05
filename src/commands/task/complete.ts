import { completeTaskForever, getApi } from '../../lib/api/core.js'
import { isQuiet, printDryRun } from '../../lib/output.js'
import { resolveTaskRef } from '../../lib/refs.js'

export async function completeTask(
    ref: string,
    options: { forever?: boolean; dryRun?: boolean },
): Promise<void> {
    const api = await getApi()
    const task = await resolveTaskRef(api, ref)

    if (task.checked) {
        console.log('Task already completed.')
        return
    }

    if (task.isUncompletable) {
        console.log('Task is uncompletable (reference item).')
        return
    }

    if (options.dryRun) {
        printDryRun('complete task', {
            Task: task.content,
            Forever: options.forever ? 'yes' : undefined,
        })
        return
    }

    if (options.forever) {
        const isRecurring = task.due?.isRecurring ?? false
        if (!isRecurring && !isQuiet()) {
            console.log('Task is not recurring, completing normally.')
        }
        await completeTaskForever(task.id)
        if (!isQuiet()) console.log(`Completed forever: ${task.content} (id:${task.id})`)
        return
    }

    await api.closeTask(task.id)
    if (!isQuiet()) console.log(`Completed: ${task.content} (id:${task.id})`)
}
