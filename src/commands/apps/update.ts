import { getApi } from '../../lib/api/core.js'
import { CliError } from '../../lib/errors.js'
import { isQuiet } from '../../lib/global-args.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import { resolveAppRef } from '../../lib/refs.js'
import {
    parseOAuthRedirectUris,
    serializeOAuthRedirectUris,
    validateRedirectUri,
    validateWebhookUrl,
} from './helpers.js'

export interface UpdateAppOptions {
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

export async function updateApp(ref: string, options: UpdateAppOptions): Promise<void> {
    const add = options.addOauthRedirect
    const remove = options.removeOauthRedirect
    const setWebhookUrl = options.setWebhookUrl

    const operations = [add, remove, setWebhookUrl].filter((op) => op !== undefined)
    if (operations.length > 1) {
        throw new CliError(
            'CONFLICTING_OPTIONS',
            '--add-oauth-redirect, --remove-oauth-redirect and --set-webhook-url cannot be used together.',
            ['Pass one flag at a time.'],
        )
    }

    if (operations.length === 0) {
        throw new CliError('NO_CHANGES', 'No changes specified.', [
            'Use --add-oauth-redirect <url>, --remove-oauth-redirect <url>, or --set-webhook-url <url>.',
        ])
    }

    if (setWebhookUrl !== undefined) {
        await setWebhook(ref, setWebhookUrl, options)
        return
    }

    // Validate only the URI we're about to persist. Removals intentionally
    // skip validation so users can clean up legacy malformed URIs that
    // predate this validator or were written by older tooling.
    if (add !== undefined && !validateRedirectUri(add)) throw invalidUri(add)

    const api = await getApi()
    const app = await resolveAppRef(api, ref)
    const current = parseOAuthRedirectUris(app.oauthRedirectUri)

    if (add !== undefined) {
        if (current.includes(add)) {
            throw new CliError(
                'ALREADY_EXISTS',
                `"${add}" is already an OAuth redirect URI for "${app.displayName}".`,
            )
        }

        const next = [...current, add]

        if (options.dryRun) {
            printDryRun('add OAuth redirect URI', {
                App: `${app.displayName} (id:${app.id})`,
                URI: add,
            })
            return
        }

        const updated = await api.updateApp(app.id, {
            oauthRedirectUri: serializeOAuthRedirectUris(next),
        })

        if (options.json) {
            console.log(formatJson(updated, 'app'))
            return
        }
        if (!isQuiet()) {
            console.log(`Added OAuth redirect URI to ${app.displayName} (id:${app.id}): ${add}`)
        }
        return
    }

    // --remove-oauth-redirect path
    const toRemove = remove as string

    if (!current.includes(toRemove)) {
        // Surface the unchanged app for scripts so `--json` stays parseable
        // even on a no-op.
        if (options.json) {
            console.log(formatJson(app, 'app'))
            return
        }
        console.log(
            `"${toRemove}" is not an OAuth redirect URI for "${app.displayName}" — nothing to remove.`,
        )
        return
    }

    if (options.dryRun) {
        printDryRun('remove OAuth redirect URI', {
            App: `${app.displayName} (id:${app.id})`,
            URI: toRemove,
        })
        return
    }

    if (!options.yes) {
        // For programmatic callers, fail loudly rather than silently no-op
        // with a human-readable preview the caller can't parse.
        if (options.json) {
            throw new CliError(
                'CONFIRMATION_REQUIRED',
                `Confirmation required to remove OAuth redirect URI from "${app.displayName}".`,
                ['Pass --yes to confirm.'],
            )
        }
        console.log(
            `Would remove OAuth redirect URI from ${app.displayName} (id:${app.id}): ${toRemove}`,
        )
        console.log('Use --yes to confirm.')
        return
    }

    const next = current.filter((u) => u !== toRemove)
    const updated = await api.updateApp(app.id, {
        oauthRedirectUri: next.length === 0 ? null : serializeOAuthRedirectUris(next),
    })

    if (options.json) {
        console.log(formatJson(updated, 'app'))
        return
    }
    if (!isQuiet()) {
        console.log(
            `Removed OAuth redirect URI from ${app.displayName} (id:${app.id}): ${toRemove}`,
        )
    }
}

// The webhook is a separate endpoint from the app record, and it holds a single
// callback URL, so setting it is a straight swap. `updateAppWebhook` requires
// the full event list, so we read the existing webhook and preserve its events
// and version — a webhook must already exist for a URL-only swap to be possible.
async function setWebhook(ref: string, url: string, options: UpdateAppOptions): Promise<void> {
    if (!validateWebhookUrl(url)) throw invalidWebhookUrl(url)

    const api = await getApi()
    const app = await resolveAppRef(api, ref)
    const webhook = await api.getAppWebhook(app.id)

    if (webhook === null) {
        throw new CliError(
            'NO_WEBHOOK',
            `No webhook configured for "${app.displayName}". A webhook must exist before its URL can be changed.`,
        )
    }

    if (webhook.callbackUrl === url) {
        // Surface the unchanged webhook for scripts so `--json` stays parseable
        // even on a no-op.
        if (options.json) {
            console.log(JSON.stringify(webhook, null, 2))
            return
        }
        console.log(
            `Webhook URL for "${app.displayName}" is already set to ${url} — nothing to change.`,
        )
        return
    }

    if (options.dryRun) {
        printDryRun('set webhook URL', {
            App: `${app.displayName} (id:${app.id})`,
            'Webhook URL': url,
        })
        return
    }

    const updated = await api.updateAppWebhook({
        appId: app.id,
        callbackUrl: url,
        events: webhook.events,
        version: webhook.version,
    })

    if (options.json) {
        console.log(JSON.stringify(updated, null, 2))
        return
    }
    if (!isQuiet()) {
        console.log(`Set webhook URL for ${app.displayName} (id:${app.id}): ${url}`)
    }
}
