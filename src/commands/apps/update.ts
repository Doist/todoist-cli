import { getApi } from '../../lib/api/core.js'
import { CliError } from '../../lib/errors.js'
import { isQuiet } from '../../lib/global-args.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import { resolveAppRef } from '../../lib/refs.js'
import {
    parseOAuthRedirectUris,
    serializeOAuthRedirectUris,
    validateRedirectUri,
} from './helpers.js'

export interface UpdateAppOptions {
    addOauthRedirect?: string
    removeOauthRedirect?: string
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

export async function updateApp(ref: string, options: UpdateAppOptions): Promise<void> {
    const add = options.addOauthRedirect
    const remove = options.removeOauthRedirect

    if (add && remove) {
        throw new CliError(
            'CONFLICTING_OPTIONS',
            '--add-oauth-redirect and --remove-oauth-redirect cannot be used together.',
            ['Pass one flag at a time.'],
        )
    }

    if (!add && !remove) {
        throw new CliError('NO_CHANGES', 'No changes specified.', [
            'Use --add-oauth-redirect <url> or --remove-oauth-redirect <url>.',
        ])
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
