import { formatJson, formatNdjson } from '@doist/cli-core'
import { runOAuthFlow } from '@doist/cli-core/auth'
import chalk from 'chalk'
import type { Command } from 'commander'
import open from 'open'
import { renderAuthErrorPage, renderAuthSuccessPage } from '../../lib/auth-html.js'
import { createTodoistAuthProvider } from '../../lib/auth-provider.js'
import { createTodoistTokenStore } from '../../lib/auth-store.js'
import { CliError } from '../../lib/errors.js'
import {
    type AdditionalScopeFlag,
    parseScopesOption,
    resolveAuthScope,
} from '../../lib/oauth-scopes.js'

const TODOIST_CALLBACK_PORT = 8765
const TODOIST_CALLBACK_PORT_FALLBACK = 5

type LoginOptions = {
    readOnly?: boolean
    callbackPort?: number
    additionalScopes?: string
    json?: boolean
    ndjson?: boolean
}

/**
 * `td auth login` — drive the OAuth flow via cli-core's `runOAuthFlow` and
 * persist the resulting token through `createTodoistTokenStore`. The flow is
 * generic; the CLI-specific bits (custom verifier alphabet, comma-separated
 * scopes, branded HTML, multi-user store) live in the local
 * `auth-provider.ts` / `auth-store.ts` / `auth-html.ts` modules.
 */
export async function loginWithOAuth(options: LoginOptions = {}): Promise<void> {
    const additionalScopes: AdditionalScopeFlag[] = options.additionalScopes
        ? parseScopesOption(options.additionalScopes)
        : []
    const readOnly = Boolean(options.readOnly)
    // resolveAuthScope returns the comma-separated string Todoist expects;
    // split into the array cli-core's PKCE provider re-joins (with
    // `scopeSeparator: ','` set on the provider).
    const scopes = resolveAuthScope({ readOnly, additionalScopes }).split(',')

    const machineOutput = Boolean(options.json || options.ndjson)

    const result = await runOAuthFlow({
        provider: createTodoistAuthProvider(),
        store: createTodoistTokenStore(),
        scopes,
        readOnly,
        flags: { additionalScopes: options.additionalScopes ?? '' },
        preferredPort: options.callbackPort ?? TODOIST_CALLBACK_PORT,
        portFallbackCount: TODOIST_CALLBACK_PORT_FALLBACK,
        renderSuccess: renderAuthSuccessPage,
        renderError: renderAuthErrorPage,
        openBrowser: async (url) => {
            await open(url)
        },
        // Suppress the fallback URL print on stdout when machine output is
        // requested — would otherwise corrupt the JSON / NDJSON envelope.
        onAuthorizeUrl: machineOutput ? () => undefined : undefined,
    })

    const account = result.account
    const label = account.label ?? account.id
    if (options.json) {
        console.log(formatJson({ displayName: 'Todoist', account }))
        return
    }
    if (options.ndjson) {
        console.log(formatNdjson([{ displayName: 'Todoist', account }]))
        return
    }
    console.log(`${chalk.green('✓')} Signed in to Todoist as ${chalk.cyan(label)}`)
}

/** Strict-integer port parser used by the `--callback-port` Commander option. */
export function parseCallbackPort(value: string): number {
    if (!/^\d+$/.test(value)) {
        throw new CliError(
            'INVALID_OPTIONS',
            `Invalid --callback-port '${value}': expected an integer in [0..65535].`,
        )
    }
    const port = Number(value)
    if (port > 65535) {
        throw new CliError(
            'INVALID_OPTIONS',
            `Invalid --callback-port '${value}': expected an integer in [0..65535].`,
        )
    }
    return port
}

export function attachLoginCommand(auth: Command): Command {
    return auth
        .command('login')
        .description('Authenticate with Todoist via OAuth')
        .option('--read-only', 'Authenticate with read-only scope (data:read)')
        .option(
            '--callback-port <port>',
            'Override the local OAuth callback port',
            parseCallbackPort,
        )
        .option(
            '--additional-scopes <list>',
            'Comma-separated opt-in OAuth scopes (see list below). The flag may be repeated; every occurrence is merged.',
            // Commander treats this as a scalar by default, so repeated uses
            // (`--additional-scopes=a --additional-scopes=b`) would silently drop
            // earlier values. Concatenate into one comma-separated string and let
            // parseScopesOption split/dedupe/validate as usual.
            (value: string, prev: string | undefined) =>
                prev && prev.length > 0 ? `${prev},${value}` : value,
        )
        .option('--json', 'Emit machine-readable JSON output')
        .option('--ndjson', 'Emit machine-readable NDJSON output')
        .action(loginWithOAuth)
}
