import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'

export interface ListAppsOptions {
    json?: boolean
    ndjson?: boolean
}

export async function listApps(options: ListAppsOptions = {}): Promise<void> {
    const api = await getApi()
    const apps = await api.getApps()

    if (options.json) {
        console.log(JSON.stringify(apps, null, 2))
        return
    }

    if (options.ndjson) {
        console.log(apps.map((app) => JSON.stringify(app)).join('\n'))
        return
    }

    if (apps.length === 0) {
        console.log('No apps found.')
        return
    }

    for (const app of apps) {
        console.log(`${app.displayName} ${chalk.dim(`(id:${app.id})`)}`)
        console.log(`   ${chalk.dim(app.description ?? '(no description)')}`)
    }
}
