import { getApi } from '../../lib/api/core.js'
import { openInBrowser } from '../../lib/browser.js'
import { resolveProjectRef } from '../../lib/refs.js'
import { projectUrl } from '../../lib/urls.js'

export async function browseProject(ref: string): Promise<void> {
    const api = await getApi()
    const project = await resolveProjectRef(api, ref)
    await openInBrowser(projectUrl(project.id))
}
