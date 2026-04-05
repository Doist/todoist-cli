import { getApi } from '../../lib/api/core.js'
import { isQuiet } from '../../lib/global-args.js'
import { printDryRun } from '../../lib/output.js'
import { resolveLabelRef } from './helpers.js'

export async function deleteLabel(
    nameOrId: string,
    options: { yes?: boolean; dryRun?: boolean },
): Promise<void> {
    const label = await resolveLabelRef(nameOrId)

    if (options.dryRun) {
        printDryRun('delete label', { Label: `@${label.name}` })
        return
    }

    if (!options.yes) {
        console.log(`Would delete: @${label.name}`)
        console.log('Use --yes to confirm.')
        return
    }

    const api = await getApi()
    await api.deleteLabel(label.id)
    if (!isQuiet()) console.log(`Deleted: @${label.name} (id:${label.id})`)
}
