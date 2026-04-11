import { getApi } from '../../lib/api/core.js'
import { isQuiet } from '../../lib/global-args.js'
import { printDryRun } from '../../lib/output.js'

export async function removeSharedLabel(
    nameArg: string,
    options: { yes?: boolean; dryRun?: boolean },
): Promise<void> {
    const name = nameArg.startsWith('@') ? nameArg.slice(1) : nameArg

    if (options.dryRun) {
        printDryRun('remove shared label', { Label: `@${name}` })
        return
    }

    if (!options.yes) {
        console.log(`Would remove shared label: @${name}`)
        console.log('Use --yes to confirm.')
        return
    }

    const api = await getApi()
    await api.removeSharedLabel({ name })
    if (!isQuiet()) console.log(`Removed shared label: @${name}`)
}
