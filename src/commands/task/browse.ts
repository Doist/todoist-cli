import { getApi } from '../../lib/api/core.js'
import { openInBrowser } from '../../lib/browser.js'
import { resolveTaskRef } from '../../lib/refs.js'
import { taskUrl } from '../../lib/urls.js'

export async function browseTask(ref: string): Promise<void> {
    const api = await getApi()
    const task = await resolveTaskRef(api, ref)
    await openInBrowser(taskUrl(task.id))
}
