import { Command } from 'commander'
import { loginWithOAuth } from './login.js'
import { logout } from './logout.js'
import { showStatus } from './status.js'
import { loginWithToken } from './token.js'

export function registerAuthCommand(program: Command): void {
    const auth = program.command('auth').description('Manage authentication')

    auth.command('login')
        .description('Authenticate with Todoist via OAuth')
        .option('--read-only', 'Authenticate with read-only scope (data:read)')
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
