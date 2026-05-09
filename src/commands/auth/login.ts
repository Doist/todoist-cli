import { formatJson, formatNdjson } from '@doist/cli-core'
import { attachLoginCommand } from '@doist/cli-core/auth'
import chalk from 'chalk'
import type { Command } from 'commander'
import open from 'open'
import { renderAuthErrorPage, renderAuthSuccessPage } from '../../lib/auth-html.js'
import { createTodoistAuthProvider } from '../../lib/auth-provider.js'
import { createTodoistTokenStore, type TodoistAccount } from '../../lib/auth-store.js'
import {
    type AdditionalScopeFlag,
    formatScopesHelp,
    parseScopesOption,
    resolveAuthScope,
} from '../../lib/oauth-scopes.js'

const TODOIST_CALLBACK_PORT = 8765
const TODOIST_CALLBACK_PORT_FALLBACK = 5

/**
 * Attach `td auth login` via cli-core's generic `attachLoginCommand`. The
 * registrar wires `--read-only`, `--callback-port`, `--json`, `--ndjson` and
 * drives `runOAuthFlow`; the bits below stay todoist-local: scope resolution
 * (comma-joined, custom validators), branded HTML, multi-user store via
 * `createTodoistTokenStore`, and the human-mode success line.
 *
 * `--additional-scopes` is attached after the registrar so the option lands on
 * the same Commander view; cli-core surfaces it through the `flags` argument
 * to `resolveScopes`.
 */
export function attachTodoistLoginCommand(auth: Command): Command {
    const login = attachLoginCommand<TodoistAccount>(auth, {
        provider: createTodoistAuthProvider(),
        store: createTodoistTokenStore(),
        preferredPort: TODOIST_CALLBACK_PORT,
        portFallbackCount: TODOIST_CALLBACK_PORT_FALLBACK,
        resolveScopes: ({ readOnly, flags }) => {
            const additionalScopes: AdditionalScopeFlag[] = flags.additionalScopes
                ? parseScopesOption(flags.additionalScopes as string)
                : []
            // resolveAuthScope returns the comma-separated string Todoist expects;
            // split into the array cli-core's PKCE provider re-joins (the provider
            // is configured with `scopeSeparator: ','`).
            return resolveAuthScope({ readOnly, additionalScopes }).split(',')
        },
        renderSuccess: renderAuthSuccessPage,
        renderError: renderAuthErrorPage,
        openBrowser: async (url) => {
            await open(url)
        },
        onSuccess: ({ account, view }) => {
            if (view.json) {
                console.log(formatJson({ displayName: 'Todoist', account }))
                return
            }
            if (view.ndjson) {
                console.log(formatNdjson([{ displayName: 'Todoist', account }]))
                return
            }
            const label = account.label ?? account.id
            console.log(`${chalk.green('✓')} Signed in to Todoist as ${chalk.cyan(label)}`)
        },
    })

    return login
        .description('Authenticate with Todoist via OAuth')
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
        .addHelpText('after', formatScopesHelp())
}
