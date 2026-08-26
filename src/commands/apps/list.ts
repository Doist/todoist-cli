import { printEmpty } from '@doist/cli-core'
import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { resolveOutputMode } from '../../lib/output-mode.js'
import { outputIds } from '../../lib/output.js'

export interface ListAppsOptions {
    idsOnly?: boolean
    json?: boolean
    ndjson?: boolean
}

export async function listApps(options: ListAppsOptions = {}): Promise<void> {
    const outputMode = resolveOutputMode(options)
    const api = await getApi()
    const apps = await api.getApps()

    if (outputMode === 'ids-only') {
        outputIds(apps, (app) => app.id)
        return
    }

    if (apps.length === 0) {
        printEmpty({ options, message: 'No apps found.' })
        return
    }

    if (outputMode === 'json') {
        console.log(JSON.stringify(apps, null, 2))
        return
    }

    if (outputMode === 'ndjson') {
        console.log(apps.map((app) => JSON.stringify(app)).join('\n'))
        return
    }

    for (const app of apps) {
        console.log(`${app.displayName} ${chalk.dim(`(id:${app.id})`)}`)
        console.log(`   ${chalk.dim(`Client ID: ${app.clientId}`)}`)
        console.log(`   ${chalk.dim(app.description ?? '(no description)')}`)
    }
}
