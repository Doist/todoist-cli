import { extname } from 'node:path'
import { getApi } from '../../lib/api/core.js'
import { CliError } from '../../lib/errors.js'
import { isQuiet } from '../../lib/global-args.js'
import { openLocalFileAsBlob } from '../../lib/local-file.js'
import { formatJson, printDryRun, processJsonItem } from '../../lib/output.js'
import { resolveAppRef } from '../../lib/refs.js'
import {
    APP_ICON_EXTENSIONS,
    APP_ICON_SIZES,
    APP_ICON_SPECS,
    type AppIconSize,
    isAppIconSize,
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
    icon?: string
    iconSize?: string
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
// performs up to three API operations: an app-record patch (name, description
// and/or OAuth redirect URIs via `updateApp`), an icon upload (`uploadAppIcon`)
// and a webhook URL swap (a separate endpoint via `updateAppWebhook`). The only
// mutually-exclusive pair is --add-oauth-redirect / --remove-oauth-redirect,
// which read-modify-write the same field with different confirmation semantics.
export async function updateApp(ref: string, options: UpdateAppOptions): Promise<void> {
    const { name, description, addOauthRedirect: add, removeOauthRedirect: remove } = options
    const { setWebhookUrl, icon } = options

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

    if (options.iconSize !== undefined && icon === undefined) {
        throw new CliError('INVALID_OPTIONS', '--icon-size requires --icon <path>.')
    }

    if (
        name === undefined &&
        description === undefined &&
        add === undefined &&
        remove === undefined &&
        setWebhookUrl === undefined &&
        icon === undefined
    ) {
        throw new CliError('NO_CHANGES', 'No changes specified.', [
            'Use --name, --description, --add-oauth-redirect <url>, --remove-oauth-redirect <url>, --set-webhook-url <url>, or --icon <path>.',
        ])
    }

    // The icon file is opened here, before any network call and before
    // --dry-run, so a bad path or an oversized file fails fast.
    const iconUpload = icon !== undefined ? await prepareIcon(icon, options.iconSize) : null

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
        if (name === app.displayName) {
            noops.push(
                `Display name for "${app.displayName}" is already "${name}" — nothing to change.`,
            )
        } else {
            patch.displayName = name
            changes.push(`set name to "${name}"`)
        }
    }

    if (description !== undefined) {
        // A null and an empty-string description both mean "no description", so
        // clearing an already-empty description is a no-op.
        if ((app.description ?? '') === description) {
            noops.push(`Description for "${app.displayName}" already matches — nothing to change.`)
        } else {
            patch.description = description
            changes.push(description === '' ? 'cleared description' : 'set description')
        }
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

    // An upload always counts as a change: there's no way to tell whether the
    // file matches the icon already stored.
    if (iconUpload !== null) {
        changes.push(`uploaded ${iconUpload.size} icon ${iconUpload.fileName}`)
    }

    const hasRecordChange = Object.keys(patch).length > 0
    const hasWebhookChange = webhookWillChange
    const hasIconChange = iconUpload !== null
    // The JSON output shape is keyed on which surfaces the flags addressed, not
    // on which mutated, so it stays stable even when a sub-op is a no-op. An
    // icon upload returns the app, so it counts as touching the app surface.
    const appTouched =
        name !== undefined ||
        description !== undefined ||
        add !== undefined ||
        remove !== undefined ||
        icon !== undefined
    const webhookTouched = setWebhookUrl !== undefined

    // Phase D — gating.
    // Every requested change was a no-op (remove-not-present and/or
    // webhook-already-set). Surface the unchanged object so scripts stay
    // parseable, and exit 0.
    if (!hasRecordChange && !hasWebhookChange && !hasIconChange) {
        if (options.json) {
            printResultJson({ app, webhook, appTouched, webhookTouched })
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
                'description' in patch
                    ? patch.description === ''
                        ? '(cleared)'
                        : patch.description
                    : undefined,
            'OAuth redirect':
                add !== undefined
                    ? `add ${add}`
                    : removeIsMutation
                      ? `remove ${remove}`
                      : undefined,
            Icon: iconUpload ? `${iconUpload.filePath} (${iconUpload.size})` : undefined,
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

    // Phase E — execute. Record patch first, then the icon upload, then the
    // webhook swap. If a later call throws, the earlier changes are already
    // persisted and the error propagates — there is no rollback.
    let updatedApp = app
    if (hasRecordChange) updatedApp = await api.updateApp(app.id, patch)
    if (iconUpload !== null) {
        updatedApp = await api.uploadAppIcon({
            appId: app.id,
            file: iconUpload.blob,
            fileName: iconUpload.fileName,
            size: iconUpload.size,
        })
    }

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
        printResultJson({ app: updatedApp, webhook: updatedWebhook, appTouched, webhookTouched })
        return
    }
    if (!isQuiet()) {
        console.log(`Updated ${app.displayName} (id:${app.id}) — ${changes.join('; ')}.`)
        for (const line of noops) console.log(line)
    }
}

// Single-surface invocations keep their historical bare-object shapes so
// existing scripts don't break; only when both the app and the webhook are
// touched do we emit a combined, self-describing document.
function printResultJson({
    app,
    webhook,
    appTouched,
    webhookTouched,
}: {
    app: Awaited<ReturnType<Awaited<ReturnType<typeof getApi>>['getApp']>>
    webhook: Awaited<ReturnType<Awaited<ReturnType<typeof getApi>>['getAppWebhook']>>
    appTouched: boolean
    webhookTouched: boolean
}): void {
    if (appTouched && webhookTouched) {
        console.log(JSON.stringify({ app: processJsonItem(app, 'app'), webhook }, null, 2))
        return
    }
    if (webhookTouched) {
        console.log(JSON.stringify(webhook, null, 2))
        return
    }
    console.log(formatJson(app, 'app'))
}

type IconUpload = {
    blob: Blob
    filePath: string
    fileName: string
    size: AppIconSize
}

// Validates everything about the icon that can be checked locally: the slot
// name, the file's extension (the backend picks the image format from it) and
// its byte size against that slot's limit. Pixel dimensions are checked by the
// server.
async function prepareIcon(path: string, rawSize: string | undefined): Promise<IconUpload> {
    const size = rawSize ?? 'medium'
    if (!isAppIconSize(size)) {
        throw new CliError('INVALID_OPTIONS', `Invalid icon size: ${size}`, [
            `Use one of: ${APP_ICON_SIZES.join(', ')}.`,
        ])
    }

    // Open the file first so a missing or unreadable path reports
    // FILE_NOT_FOUND / FILE_READ_ERROR whatever its extension.
    const { blob, filePath, fileName } = await openLocalFileAsBlob({ file: path })
    if (!APP_ICON_EXTENSIONS.has(extname(fileName).toLowerCase())) {
        throw new CliError('INVALID_TYPE', `Icon must be a PNG or JPEG file: ${filePath}`, [
            'Use a file ending in .png, .jpg or .jpeg.',
        ])
    }

    const spec = APP_ICON_SPECS[size]
    if (blob.size === 0) {
        throw new CliError('FILE_READ_ERROR', `Icon file is empty: ${filePath}`)
    }
    if (blob.size > spec.maxBytes) {
        throw new CliError(
            'FILE_TOO_LARGE',
            `Icon file is too large for the ${size} slot (${blob.size} bytes, limit ${spec.maxBytes} bytes).`,
            [
                `A ${size} icon must be ${spec.width}×${spec.height} pixels and at most ${spec.maxBytes / 1000}KB.`,
            ],
        )
    }

    return { blob, filePath, fileName, size }
}
