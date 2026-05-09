import type { Command } from 'commander'
import { formatScopesHelp } from '../../lib/oauth-scopes.js'
import { attachLoginCommand } from './login.js'
import { logout } from './logout.js'
import { showStatus } from './status.js'
import { viewToken } from './token-view.js'
import { loginWithToken } from './token.js'

export function registerAuthCommand(program: Command): void {
    const auth = program.command('auth').description('Manage authentication')

    attachLoginCommand(auth).addHelpText('after', formatScopesHelp())

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
