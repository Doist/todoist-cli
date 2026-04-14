import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { resolveAppRef } from '../../lib/refs.js'

export interface ViewAppOptions {
    json?: boolean
    ndjson?: boolean
    includeSecrets?: boolean
}

const HIDDEN_HINT = '(hidden — pass --include-secrets to reveal)'

function hiddenLine(label: string): string {
    return `  ${label}${chalk.dim(HIDDEN_HINT)}`
}

export async function viewApp(ref: string, options: ViewAppOptions = {}): Promise<void> {
    const api = await getApi()
    const app = await resolveAppRef(api, ref)
    const reveal = Boolean(options.includeSecrets)

    // Always fetch: secrets (for the public clientId) and webhook config.
    // Verification / test / distribution tokens are only useful when reveal is
    // on, so gate the fetch to avoid paying for data we can't display.
    const [secrets, webhook, verification, testToken, distribution] = await Promise.all([
        api.getAppSecrets(app.id),
        api.getAppWebhook(app.id),
        reveal ? api.getAppVerificationToken(app.id) : Promise.resolve(null),
        reveal ? api.getAppTestToken(app.id) : Promise.resolve(null),
        reveal ? api.getAppDistributionToken(app.id) : Promise.resolve(null),
    ])

    if (options.json || options.ndjson) {
        const payload: Record<string, unknown> = {
            ...app,
            clientId: secrets.clientId,
            webhook,
        }
        if (reveal) {
            payload.clientSecret = secrets.clientSecret
            payload.verificationToken = verification?.verificationToken ?? null
            payload.distributionToken = distribution?.distributionToken ?? null
            payload.testToken = { accessToken: testToken?.accessToken ?? null }
        }
        const indent = options.json ? 2 : undefined
        console.log(JSON.stringify(payload, null, indent))
        return
    }

    const created = app.createdAt.toISOString().slice(0, 10)
    const scopes =
        app.appTokenScopes && app.appTokenScopes.length > 0
            ? app.appTokenScopes.join(', ')
            : '(none)'

    console.log(chalk.bold(app.displayName))
    console.log('')
    console.log(`  ID:                 ${app.id}`)
    console.log(`  Status:             ${app.status}`)
    console.log(`  Users:              ${app.userCount}`)
    console.log(`  Created:            ${created}`)
    console.log(`  Service URL:        ${app.serviceUrl || '(none)'}`)
    console.log(`  OAuth redirect:     ${app.oauthRedirectUri || '(none)'}`)
    console.log(`  Token scopes:       ${scopes}`)
    if (app.iconMd) {
        console.log(`  Icon:               ${chalk.dim(app.iconMd)}`)
    }

    console.log('')
    console.log(`  Client ID:          ${secrets.clientId}`)

    if (reveal) {
        console.log(`  Client secret:      ${secrets.clientSecret}`)
        console.log(`  Verification token: ${verification?.verificationToken ?? '(none)'}`)
        const accessToken = testToken?.accessToken
        console.log(
            `  Test token:         ${accessToken == null ? chalk.dim('(not created)') : accessToken}`,
        )
        console.log(`  Distribution token: ${distribution?.distributionToken ?? '(none)'}`)
    } else {
        console.log(hiddenLine('Client secret:      '))
        console.log(hiddenLine('Verification token: '))
        console.log(hiddenLine('Test token:         '))
        console.log(hiddenLine('Distribution token: '))
    }

    if (webhook === null) {
        console.log(`  Webhook:            ${chalk.dim('(not configured)')}`)
    } else {
        console.log(`  Webhook:            ${webhook.status} — ${webhook.callbackUrl}`)
        console.log(`  Webhook events:     ${webhook.events.join(', ') || '(none)'}`)
        console.log(`  Webhook version:    ${webhook.version}`)
    }

    console.log('')
    console.log(app.description ?? chalk.dim('(no description)'))
}
