import { attachTokenViewCommand } from '@doist/cli-core/auth'
import type { Command } from 'commander'
import { createTodoistTokenStore } from '../../lib/auth-store.js'
import { TOKEN_ENV_VAR } from '../../lib/auth.js'
import { attachTodoistLoginCommand } from './login.js'
import { attachTodoistLogoutCommand } from './logout.js'
import { attachTodoistStatusCommand } from './status.js'
import { withUserRefAware } from './store-wrap.js'
import { loginWithToken } from './token.js'

export function registerAuthCommand(program: Command): void {
    const auth = program.command('auth').description('Manage authentication')

    // Shared store: login stashes the post-`set` storage result for its
    // success handler; logout reads the post-`clear` result for the same
    // keyring-fallback warning surface; status uses `active()` as the
    // authenticated-snapshot gate.
    const store = createTodoistTokenStore()

    attachTodoistLoginCommand(auth, store)
    attachTodoistLogoutCommand(auth, store)
    attachTodoistStatusCommand(auth, store)

    // `token` is a hybrid: positional `[token]` saves, and the `view`
    // subcommand prints. Commander matches the subcommand name before the
    // parent action, so `td auth token view` always dispatches to the view
    // path — Todoist tokens are 40-char hex so the disambiguation is safe.
    const tokenCmd = auth
        .command('token [token]')
        .description('Save API token for CLI authentication (or use a subcommand: `view`)')
        .action(loginWithToken)

    attachTokenViewCommand(tokenCmd, {
        name: 'view',
        store: withUserRefAware(store),
        envVarName: TOKEN_ENV_VAR,
        description:
            'Print the stored API token for the active user (or --user <ref>) to stdout for use in scripts',
    })
}
