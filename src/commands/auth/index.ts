import { attachTokenViewCommand } from '@doist/cli-core/auth'
import type { Command } from 'commander'
import { createTodoistTokenStore, TOKEN_ENV_VAR } from '../../lib/auth-store.js'
import { attachTodoistLoginCommand } from './login.js'
import { attachTodoistLogoutCommand } from './logout.js'
import { attachTodoistStatusCommand } from './status.js'
import { withUserRefAware } from './store-wrap.js'
import { loginWithToken } from './token.js'

export function registerAuthCommand(program: Command): void {
    const auth = program.command('auth').description('Manage authentication')

    // Two stores share storage but expose different reads:
    //   - `store` is the raw cli-core `TokenStore` — login uses it to `set()`,
    //     status uses `active()` (with env-token short-circuit) as the
    //     authenticated-snapshot gate.
    //   - `refAware` substitutes `getRequestedUserRef()` for the `--user
    //     <ref>` that `index.ts` strips from argv before commander runs, and
    //     turns ref-misses into typed `UserNotFoundError`. Used by every
    //     cli-core registrar that needs the global `--user` flag (logout +
    //     token view).
    const store = createTodoistTokenStore()
    const refAware = withUserRefAware(store)

    attachTodoistLoginCommand(auth, store)
    attachTodoistLogoutCommand(auth, refAware)
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
        store: refAware,
        envVarName: TOKEN_ENV_VAR,
        description:
            'Print the stored API token for the active user (or --user <ref>) to stdout for use in scripts',
    })
}
