import { openInBrowser } from '../../lib/browser.js'
import { filterUrl } from '../../lib/urls.js'
import { resolveFilterRef } from './helpers.js'

export async function browseFilter(nameOrId: string): Promise<void> {
    const filter = await resolveFilterRef(nameOrId)
    await openInBrowser(filterUrl(filter.id))
}
