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

    // Webhook config is always shown (callback URL is user-supplied, not a
    // secret). Everything else is gated on `reveal` so we never transport
    // secret data onto the user's machine unless they asked for it — this
    // includes `getAppSecrets`, whose payload also carries the `clientId`.
    // The public `client_id` is only available via that endpoint today, so
    // gating the call also gates the visible Client ID line.
    const [webhook, secrets, verification, testToken, distribution] = await Promise.all([
        api.getAppWebhook(app.id),
        reveal ? api.getAppSecrets(app.id) : Promise.resolve(null),
        reveal ? api.getAppVerificationToken(app.id) : Promise.resolve(null),
        reveal ? api.getAppTestToken(app.id) : Promise.resolve(null),
        reveal ? api.getAppDistributionToken(app.id) : Promise.resolve(null),
    ])

    if (options.json || options.ndjson) {
        const payload: Record<string, unknown> = { ...app, webhook }
        if (reveal && secrets) {
            payload.clientId = secrets.clientId
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

    if (reveal && secrets) {
        console.log(`  Client ID:          ${secrets.clientId}`)
        console.log(`  Client secret:      ${secrets.clientSecret}`)
        console.log(`  Verification token: ${verification?.verificationToken ?? '(none)'}`)
        const accessToken = testToken?.accessToken
        console.log(
            `  Test token:         ${accessToken == null ? chalk.dim('(not created)') : accessToken}`,
        )
        console.log(`  Distribution token: ${distribution?.distributionToken ?? '(none)'}`)
    } else {
        console.log(hiddenLine('Client ID:          '))
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
