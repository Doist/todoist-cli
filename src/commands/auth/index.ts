import { Command } from 'commander'
import { formatScopesHelp } from '../../lib/oauth-scopes.js'
import { loginWithOAuth } from './login.js'
import { logout } from './logout.js'
import { showStatus } from './status.js'
import { viewToken } from './token-view.js'
import { loginWithToken } from './token.js'

export function registerAuthCommand(program: Command): void {
    const auth = program.command('auth').description('Manage authentication')

    auth.command('login')
        .description('Authenticate with Todoist via OAuth')
        .option('--read-only', 'Authenticate with read-only scope (data:read)')
        .option(
            '--additional-scopes <list>',
            'Comma-separated opt-in OAuth scopes (see list below). The flag may be repeated; every occurrence is merged.',
            // Commander treats this as a scalar by default, so repeated uses
            // (`--additional-scopes=a --additional-scopes=b`) would silently
            // drop earlier values. Concatenate into one comma-separated string
            // and let parseScopesOption split/dedupe/validate as usual.
            (value: string, prev: string | undefined) => (prev ? `${prev},${value}` : value),
        )
        .addHelpText('after', formatScopesHelp())
        .action(loginWithOAuth)

    // `token` is a hybrid: it accepts a positional `[token]` (save) and also
    // exposes subcommands (`view`). Commander matches subcommand names before
    // falling through to the parent action, so `td auth token view` always
    // dispatches to the `view` subcommand — `view` is never treated as a
    // literal token value. Real Todoist tokens are 40-char hex strings, so
    // this disambiguation is safe in practice.
    const tokenCmd = auth
        .command('token [token]')
        .description('Save API token for CLI authentication (or use a subcommand: `view`)')
        .action(loginWithToken)

    tokenCmd
        .command('view')
        .description(
            'Print the stored API token for the active user (or --user <ref>) to stdout for use in scripts',
        )
        .action(viewToken)

    auth.command('status')
        .description('Show current authentication status')
        .option('--json', 'Output as JSON')
        .action(showStatus)

    auth.command('logout').description('Remove saved authentication token').action(logout)
}
