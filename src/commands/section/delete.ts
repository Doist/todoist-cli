import { getApi } from '../../lib/api/core.js'
import { formatError, isQuiet, printDryRun } from '../../lib/output.js'
import { lenientIdRef } from '../../lib/refs.js'

export async function deleteSection(
    sectionId: string,
    options: { yes?: boolean; dryRun?: boolean },
): Promise<void> {
    const id = lenientIdRef(sectionId, 'section')

    const api = await getApi()
    const section = await api.getSection(id)

    const { results: tasks } = await api.getTasks({ sectionId: id })
    if (tasks.length > 0) {
        throw new Error(
            formatError(
                'HAS_TASKS',
                `Cannot delete section: ${tasks.length} uncompleted task${tasks.length === 1 ? '' : 's'} remain.`,
            ),
        )
    }

    if (options.dryRun) {
        printDryRun('delete section', { Section: section.name })
        return
    }

    if (!options.yes) {
        console.log(`Would delete section: ${section.name}`)
        console.log('Use --yes to confirm.')
        return
    }

    await api.deleteSection(id)
    if (!isQuiet()) console.log(`Deleted section: ${section.name} (id:${id})`)
}
