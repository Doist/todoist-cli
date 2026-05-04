import { getApi } from '../../lib/api/core.js'
import { isQuiet } from '../../lib/global-args.js'
import { printDryRun } from '../../lib/output.js'
import { resolveFolderByRef } from './helpers.js'

export async function deleteFolder(
    ref: string,
    options: { workspace?: string; yes?: boolean; dryRun?: boolean },
): Promise<void> {
    const folder = await resolveFolderByRef(ref, options)

    if (options.dryRun) {
        printDryRun('delete folder', { Folder: folder.name })
        return
    }

    if (!options.yes) {
        console.log(`Would delete folder: ${folder.name}`)
        console.log('Use --yes to confirm.')
        return
    }

    const api = await getApi()
    await api.deleteFolder(folder.id)
    if (!isQuiet()) console.log(`Deleted: ${folder.name} (id:${folder.id})`)
}
