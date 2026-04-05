import { getApi } from '../../lib/api/core.js'
import { isQuiet } from '../../lib/global-args.js'
import { printDryRun } from '../../lib/output.js'
import { lenientIdRef } from '../../lib/refs.js'

export async function archiveSection(
    sectionId: string,
    options: { dryRun?: boolean },
): Promise<void> {
    const id = lenientIdRef(sectionId, 'section')
    const api = await getApi()
    const section = await api.getSection(id)

    if (options.dryRun) {
        printDryRun('archive section', { Section: section.name })
        return
    }

    await api.archiveSection(id)
    if (!isQuiet()) console.log(`Archived: ${section.name} (id:${id})`)
}
