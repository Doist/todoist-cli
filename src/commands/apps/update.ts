import { getApi } from '../../lib/api/core.js'
import { CliError } from '../../lib/errors.js'
import { isQuiet } from '../../lib/global-args.js'
import { printDryRun } from '../../lib/output.js'
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

    if (add !== undefined && !validateRedirectUri(add)) {
        throw new CliError('INVALID_URL', `Invalid OAuth redirect URI: ${add}`, [
            'Use https://<host>, http(s)://localhost[:port][/path], or a custom scheme (e.g. myapp://callback).',
            'Schemes javascript, data, file, vbscript, ftp are not allowed.',
        ])
    }

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
            console.log(JSON.stringify(updated, null, 2))
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
        console.log(JSON.stringify(updated, null, 2))
        return
    }
    if (!isQuiet()) {
        console.log(
            `Removed OAuth redirect URI from ${app.displayName} (id:${app.id}): ${toRemove}`,
        )
    }
}
