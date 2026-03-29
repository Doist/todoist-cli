import { getApi } from '../../lib/api/core.js'
import { printDryRun } from '../../lib/output.js'
import { lenientIdRef } from '../../lib/refs.js'

export async function uncompleteTask(ref: string, options: { dryRun?: boolean }): Promise<void> {
    const id = lenientIdRef(ref, 'task')

    if (options.dryRun) {
        printDryRun('reopen task', { ID: id })
        return
    }

    const api = await getApi()
    await api.reopenTask(id)
    console.log(`Reopened task ${id}`)
}
