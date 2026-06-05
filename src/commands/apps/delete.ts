import { getApi } from '../../lib/api/core.js'
import { isQuiet } from '../../lib/global-args.js'
import { printDryRun } from '../../lib/output.js'
import { resolveAppRef } from '../../lib/refs.js'

export interface DeleteAppOptions {
    yes?: boolean
    dryRun?: boolean
}

export async function deleteApp(ref: string, options: DeleteAppOptions): Promise<void> {
    const api = await getApi()
    const app = await resolveAppRef(api, ref)

    if (options.dryRun) {
        printDryRun('delete app', {
            App: app.displayName,
            ID: app.id,
        })
        return
    }

    if (!options.yes) {
        console.log(`Would delete app: ${app.displayName} (id:${app.id})`)
        console.log('Use --yes to confirm.')
        return
    }

    await api.deleteApp(app.id)

    if (!isQuiet()) {
        console.log(`Deleted: ${app.displayName} (id:${app.id})`)
    }
}
