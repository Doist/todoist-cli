import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { resolveAppRef } from '../../lib/refs.js'

export interface ViewAppOptions {
    json?: boolean
    ndjson?: boolean
}

export async function viewApp(ref: string, options: ViewAppOptions = {}): Promise<void> {
    const api = await getApi()
    const app = await resolveAppRef(api, ref)

    if (options.json) {
        console.log(JSON.stringify(app, null, 2))
        return
    }

    if (options.ndjson) {
        console.log(JSON.stringify(app))
        return
    }

    const created = app.createdAt.toISOString().slice(0, 10)
    const scopes =
        app.appTokenScopes && app.appTokenScopes.length > 0
            ? app.appTokenScopes.join(', ')
            : '(none)'

    console.log(chalk.bold(app.displayName))
    console.log('')
    console.log(`  ID:             ${app.id}`)
    console.log(`  Status:         ${app.status}`)
    console.log(`  Users:          ${app.userCount}`)
    console.log(`  Created:        ${created}`)
    console.log(`  Service URL:    ${app.serviceUrl || '(none)'}`)
    console.log(`  OAuth redirect: ${app.oauthRedirectUri || '(none)'}`)
    console.log(`  Token scopes:   ${scopes}`)
    if (app.iconMd) {
        console.log(`  Icon:           ${chalk.dim(app.iconMd)}`)
    }

    console.log('')
    console.log(app.description ?? chalk.dim('(no description)'))
}
