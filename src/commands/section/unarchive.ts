import { getApi } from '../../lib/api/core.js'
import { isQuiet, printDryRun } from '../../lib/output.js'
import { lenientIdRef } from '../../lib/refs.js'

export async function unarchiveSection(
    sectionId: string,
    options: { dryRun?: boolean },
): Promise<void> {
    const id = lenientIdRef(sectionId, 'section')
    const api = await getApi()
    const section = await api.getSection(id)

    if (!section.isArchived) {
        console.log('Section is not archived.')
        return
    }

    if (options.dryRun) {
        printDryRun('unarchive section', { Section: section.name })
        return
    }

    await api.unarchiveSection(id)
    if (!isQuiet()) console.log(`Unarchived: ${section.name} (id:${id})`)
}
