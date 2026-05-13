import type { Command } from 'commander'
import { createTodoistTokenStore } from '../../lib/auth-store.js'
import { attachTodoistLoginCommand } from './login.js'
import { attachTodoistLogoutCommand } from './logout.js'
import { attachTodoistStatusCommand } from './status.js'
import { viewToken } from './token-view.js'
import { loginWithToken } from './token.js'

export function registerAuthCommand(program: Command): void {
    const auth = program.command('auth').description('Manage authentication')

    // Shared store instance: login stashes the post-`set` storage result for
    // its success handler, logout reads the post-`clear` result for the same
    // keyring-fallback warning surface. Status uses `active()` as the
    // authenticated-snapshot gate.
    const store = createTodoistTokenStore()

    attachTodoistLoginCommand(auth, store)
    attachTodoistLogoutCommand(auth, store)
    attachTodoistStatusCommand(auth, store)

    // `token` is a hybrid: it accepts a positional `[token]` (save) and also
    // exposes subcommands (`view`). Commander matches subcommand names before
    // falling through to the parent action, so `td auth token view` always
    // dispatches to the `view` subcommand — `view` is never treated as a
    // literal token value. Real Todoist tokens are 40-char hex strings, so
    // this disambiguation is safe in practice.
    //
    // `token view` stays hand-rolled (not migrated to `attachTokenViewCommand`)
    // because it depends on the `--user <ref>` selector + env precedence rules
    // that the `TokenStore` adapter intentionally drops from `active()`.
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
}
