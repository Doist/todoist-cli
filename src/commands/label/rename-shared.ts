import { getApi } from '../../lib/api/core.js'
import { isQuiet } from '../../lib/global-args.js'
import { printDryRun } from '../../lib/output.js'

export async function renameSharedLabel(
    nameArg: string,
    options: { name?: string; dryRun?: boolean },
): Promise<void> {
    const name = nameArg.startsWith('@') ? nameArg.slice(1) : nameArg

    if (options.dryRun) {
        printDryRun('rename shared label', { From: `@${name}`, To: `@${options.name}` })
        return
    }

    const api = await getApi()
    await api.renameSharedLabel({ name, newName: options.name! })
    if (!isQuiet()) console.log(`Renamed: @${name} → @${options.name}`)
}
