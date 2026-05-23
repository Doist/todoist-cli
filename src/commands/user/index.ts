import { Command } from 'commander'
import { createTodoistTokenStore } from '../../lib/auth-store.js'
import { ACCOUNT_COMMAND_ALIASES } from './aliases.js'
import { attachTodoistUserCurrentCommand } from './current.js'
import { attachTodoistUserListCommand } from './list.js'
import { attachTodoistUserRemoveCommand } from './remove.js'
import { attachTodoistUserUseCommand } from './use.js'

export function registerUserCommand(program: Command): void {
    // Renamed from `user` to `accounts`; `user`/`users` stay as aliases so
    // existing scripts (and the docs that long said `td user …`) keep working.
    const account = program
        .command('accounts')
        .aliases(ACCOUNT_COMMAND_ALIASES)
        .description('Manage stored Todoist accounts (multi-user)')

    // All four subcommands delegate to cli-core's generic account attachers
    // (list/use/current/remove), consuming the `TokenStore` contract directly.
    const store = createTodoistTokenStore()
    attachTodoistUserListCommand(account, store)
    attachTodoistUserUseCommand(account, store)
    attachTodoistUserCurrentCommand(account, store)
    attachTodoistUserRemoveCommand(account, store)

    account.addHelpText(
        'after',
        `
Examples:
  $ td auth login                     # add an account (sets it as default if first)
  $ td accounts list                  # see all stored accounts
  $ td accounts use scott@doist.com   # set default
  $ td accounts current               # show the active account
  $ td --user other@example.com task list   # one-off override
  $ td accounts remove old@example.com`,
    )
}
