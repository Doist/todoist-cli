import { Command } from 'commander'
import { formatScopesHelp } from '../../lib/oauth-scopes.js'
import { loginWithOAuth } from './login.js'
import { logout } from './logout.js'
import { showStatus } from './status.js'
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

    auth.command('token [token]')
        .description('Save API token for CLI authentication')
        .action(loginWithToken)

    auth.command('status')
        .description('Show current authentication status')
        .option('--json', 'Output as JSON')
        .action(showStatus)

    auth.command('logout').description('Remove saved authentication token').action(logout)
}
