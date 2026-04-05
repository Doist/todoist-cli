import { getApi } from '../../lib/api/core.js'
import { formatJson, isQuiet, printDryRun } from '../../lib/output.js'
import { lenientIdRef } from '../../lib/refs.js'

export async function updateSection(
    sectionId: string,
    options: { name: string; json?: boolean; dryRun?: boolean },
): Promise<void> {
    const id = lenientIdRef(sectionId, 'section')

    if (options.dryRun) {
        printDryRun('update section', { ID: id, Name: options.name })
        return
    }

    const api = await getApi()

    if (options.json) {
        const updated = await api.updateSection(id, { name: options.name })
        console.log(formatJson(updated, 'section'))
        return
    }

    const section = await api.getSection(id)
    const updated = await api.updateSection(id, { name: options.name })
    if (!isQuiet()) console.log(`Updated: ${section.name} → ${updated.name} (id:${id})`)
}
