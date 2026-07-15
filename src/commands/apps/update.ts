import { getApi } from '../../lib/api/core.js'
import { CliError } from '../../lib/errors.js'
import { isQuiet } from '../../lib/global-args.js'
import { formatJson, printDryRun, projectEntity } from '../../lib/output.js'
import { resolveAppRef } from '../../lib/refs.js'
import {
    parseOAuthRedirectUris,
    serializeOAuthRedirectUris,
    validateRedirectUri,
    validateWebhookUrl,
} from './helpers.js'

export interface UpdateAppOptions {
    name?: string
    description?: string
    addOauthRedirect?: string
    removeOauthRedirect?: string
    setWebhookUrl?: string
    yes?: boolean
    dryRun?: boolean
    json?: boolean
}

function invalidUri(uri: string): CliError {
    return new CliError('INVALID_URL', `Invalid OAuth redirect URI: ${uri}`, [
        'Use https://<host>, http(s)://localhost[:port][/path], http(s)://127.0.0.1[:port][/path], or a custom scheme (e.g. myapp://callback).',
        'Custom schemes javascript, data, file, vbscript, ftp are not allowed.',
    ])
}

function invalidWebhookUrl(url: string): CliError {
    return new CliError('INVALID_URL', `Invalid webhook URL: ${url}`, [
        'Use a public https://<host> URL.',
    ])
}

// Every update flag can be combined in a single invocation. The command
// performs up to two API operations: an app-record patch (name, description
// and/or OAuth redirect URIs via `updateApp`) and a webhook URL swap (a
// separate endpoint via `updateAppWebhook`). The only mutually-exclusive pair
// is --add-oauth-redirect / --remove-oauth-redirect, which read-modify-write
// the same field with different confirmation semantics.
export async function updateApp(ref: string, options: UpdateAppOptions): Promise<void> {
    const { name, description, addOauthRedirect: add, removeOauthRedirect: remove } = options
    const setWebhookUrl = options.setWebhookUrl

    // Phase A — validate up front, before any network call.
    if (add !== undefined && remove !== undefined) {
        throw new CliError(
            'CONFLICTING_OPTIONS',
            '--add-oauth-redirect and --remove-oauth-redirect cannot be used together.',
            ['Pass one at a time.'],
        )
    }

    // An empty display name would blank out the app's name; reject it. An empty
    // --description is allowed on purpose — it clears the description.
    if (name !== undefined && name.trim() === '') {
        throw new CliError('INVALID_OPTIONS', 'Display name cannot be empty.')
    }

    // Validate only the URI we're about to persist. Removals intentionally
    // skip validation so users can clean up legacy malformed URIs that
    // predate this validator or were written by older tooling.
    if (add !== undefined && !validateRedirectUri(add)) throw invalidUri(add)
    if (setWebhookUrl !== undefined && !validateWebhookUrl(setWebhookUrl)) {
        throw invalidWebhookUrl(setWebhookUrl)
    }

    if (
        name === undefined &&
        description === undefined &&
        add === undefined &&
        remove === undefined &&
        setWebhookUrl === undefined
    ) {
        throw new CliError('NO_CHANGES', 'No changes specified.', [
            'Use --name, --description, --add-oauth-redirect <url>, --remove-oauth-redirect <url>, or --set-webhook-url <url>.',
        ])
    }

    // Phase B — reads. Both happen before any write so NO_WEBHOOK / ALREADY_EXISTS
    // can't leave a half-applied state.
    const api = await getApi()
    const app = await resolveAppRef(api, ref)
    const current = parseOAuthRedirectUris(app.oauthRedirectUri)

    const webhook = setWebhookUrl !== undefined ? await api.getAppWebhook(app.id) : null
    if (setWebhookUrl !== undefined && webhook === null) {
        throw new CliError(
            'NO_WEBHOOK',
            `No webhook configured for "${app.displayName}". A webhook must exist before its URL can be changed.`,
        )
    }

    // Phase C — build the plan (no writes).
    const patch: Parameters<typeof api.updateApp>[1] = {}
    const changes: string[] = []
    const noops: string[] = []
    let removeIsMutation = false
    let webhookWillChange = false

    if (name !== undefined) {
        patch.displayName = name
        changes.push(`set name to "${name}"`)
    }

    if (description !== undefined) {
        patch.description = description
        changes.push(description === '' ? 'cleared description' : 'set description')
    }

    if (add !== undefined) {
        if (current.includes(add)) {
            throw new CliError(
                'ALREADY_EXISTS',
                `"${add}" is already an OAuth redirect URI for "${app.displayName}".`,
            )
        }
        patch.oauthRedirectUri = serializeOAuthRedirectUris([...current, add])
        changes.push(`added OAuth redirect URI ${add}`)
    }

    if (remove !== undefined) {
        if (current.includes(remove)) {
            const next = current.filter((u) => u !== remove)
            patch.oauthRedirectUri = next.length === 0 ? null : serializeOAuthRedirectUris(next)
            removeIsMutation = true
            changes.push(`removed OAuth redirect URI ${remove}`)
        } else {
            noops.push(
                `"${remove}" is not an OAuth redirect URI for "${app.displayName}" — nothing to remove.`,
            )
        }
    }

    if (setWebhookUrl !== undefined && webhook !== null) {
        if (webhook.callbackUrl === setWebhookUrl) {
            noops.push(
                `Webhook URL for "${app.displayName}" is already set to ${setWebhookUrl} — nothing to change.`,
            )
        } else {
            webhookWillChange = true
            changes.push(`set webhook URL ${setWebhookUrl}`)
        }
    }

    const hasRecordChange = Object.keys(patch).length > 0
    const hasWebhookChange = webhookWillChange
    // The JSON output shape is keyed on which surfaces the flags addressed, not
    // on which mutated, so it stays stable even when a sub-op is a no-op.
    const recordTouched =
        name !== undefined || description !== undefined || add !== undefined || remove !== undefined
    const webhookTouched = setWebhookUrl !== undefined

    // Phase D — gating.
    // Every requested change was a no-op (remove-not-present and/or
    // webhook-already-set). Surface the unchanged object so scripts stay
    // parseable, and exit 0.
    if (!hasRecordChange && !hasWebhookChange) {
        if (options.json) {
            printResultJson({ app, webhook, recordTouched, webhookTouched })
            return
        }
        for (const line of noops) console.log(line)
        return
    }

    if (options.dryRun) {
        printDryRun('update app', {
            App: `${app.displayName} (id:${app.id})`,
            Name: patch.displayName,
            Description:
                description === undefined
                    ? undefined
                    : description === ''
                      ? '(cleared)'
                      : description,
            'OAuth redirect':
                add !== undefined
                    ? `add ${add}`
                    : removeIsMutation
                      ? `remove ${remove}`
                      : undefined,
            'Webhook URL': hasWebhookChange ? setWebhookUrl : undefined,
        })
        return
    }

    // A real OAuth-redirect removal is destructive and gates the whole batch:
    // without --yes nothing is performed, so any metadata/webhook change in the
    // same invocation is withheld too.
    if (removeIsMutation && !options.yes) {
        if (options.json) {
            throw new CliError(
                'CONFIRMATION_REQUIRED',
                `Confirmation required to remove OAuth redirect URI from "${app.displayName}".`,
                ['Pass --yes to confirm.'],
            )
        }
        console.log(`Would update ${app.displayName} (id:${app.id}) — ${changes.join('; ')}.`)
        console.log('Use --yes to confirm.')
        return
    }

    // Phase E — execute. Record patch first, then the webhook swap. If the
    // record patch succeeds and the webhook call throws, the record change is
    // already persisted and the error propagates — there is no rollback.
    let updatedApp = app
    if (hasRecordChange) updatedApp = await api.updateApp(app.id, patch)

    let updatedWebhook = webhook
    if (hasWebhookChange && webhook !== null) {
        updatedWebhook = await api.updateAppWebhook({
            appId: app.id,
            callbackUrl: setWebhookUrl as string,
            events: webhook.events,
            version: webhook.version,
        })
    }

    // Phase F — output.
    if (options.json) {
        printResultJson({ app: updatedApp, webhook: updatedWebhook, recordTouched, webhookTouched })
        return
    }
    if (!isQuiet()) {
        console.log(`Updated ${app.displayName} (id:${app.id}) — ${changes.join('; ')}.`)
        for (const line of noops) console.log(line)
    }
}

// Single-surface invocations keep their historical bare-object shapes so
// existing scripts don't break; only when both the app record and the webhook
// are touched do we emit a combined, self-describing document.
function printResultJson({
    app,
    webhook,
    recordTouched,
    webhookTouched,
}: {
    app: Awaited<ReturnType<Awaited<ReturnType<typeof getApi>>['getApp']>>
    webhook: Awaited<ReturnType<Awaited<ReturnType<typeof getApi>>['getAppWebhook']>>
    recordTouched: boolean
    webhookTouched: boolean
}): void {
    if (recordTouched && webhookTouched) {
        console.log(JSON.stringify({ app: projectEntity(app, 'app'), webhook }, null, 2))
        return
    }
    if (webhookTouched) {
        console.log(JSON.stringify(webhook, null, 2))
        return
    }
    console.log(formatJson(app, 'app'))
}
