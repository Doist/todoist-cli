import { attachTokenViewCommand } from '@doist/cli-core/auth'
import type { Command } from 'commander'
import {
    createTodoistTokenStore,
    parseCredentialStore,
    TOKEN_ENV_VAR,
} from '../../lib/auth-store.js'
import { attachTodoistLoginCommand } from './login.js'
import { attachTodoistLogoutCommand } from './logout.js'
import { attachTodoistStatusCommand } from './status.js'
import { withUserRefAware } from './store-wrap.js'
import { loginWithToken } from './token.js'

export function registerAuthCommand(program: Command): void {
    const auth = program.command('auth').description('Manage authentication')

    // `store` is the raw cli-core `TokenStore` used by status, with an
    // env-token short-circuit on authenticated reads. Login creates its own
    // store so its --credential-store choice controls the write policy.
    //
    //   - `refAware` substitutes `getRequestedUserRef()` for the `--user
    //     <ref>` that `index.ts` strips from argv before commander runs, and
    //     turns ref-misses into typed `UserNotFoundError`. Used by every
    //     cli-core registrar that needs the global `--user` flag (logout +
    //     token view).
    const store = createTodoistTokenStore()
    const refAware = withUserRefAware(store)

    attachTodoistLoginCommand(auth)
    attachTodoistLogoutCommand(auth, refAware)
    attachTodoistStatusCommand(auth, store)

    // `token` is a hybrid: positional `[token]` saves, and the `view`
    // subcommand prints. Commander matches the subcommand name before the
    // parent action, so `td auth token view` always dispatches to the view
    // path — Todoist tokens are 40-char hex so the disambiguation is safe.
    const tokenCmd = auth
        .command('token [token]')
        .description('Save API token for CLI authentication (or use a subcommand: `view`)')
        .option(
            '--credential-store <store>',
            'Where to store the credential: system (default) or plaintext',
            parseCredentialStore,
            'system',
        )
        .action(loginWithToken)

    attachTokenViewCommand(tokenCmd, {
        name: 'view',
        store: refAware,
        envVarName: TOKEN_ENV_VAR,
        description:
            'Print the stored API token for the active user (or --user <ref>) to stdout for use in scripts',
    })
}
