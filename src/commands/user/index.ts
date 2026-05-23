import { Command } from 'commander'
import { createTodoistTokenStore } from '../../lib/auth-store.js'
import { currentUserCommand } from './current.js'
import { attachTodoistUserListCommand } from './list.js'
import { removeUserCommand } from './remove.js'
import { attachTodoistUserUseCommand } from './use.js'

export function registerUserCommand(program: Command): void {
    // Renamed from `user` to `accounts`; `user`/`users` stay as aliases so
    // existing scripts (and the docs that long said `td user …`) keep working.
    const account = program
        .command('accounts')
        .aliases(['user', 'users'])
        .description('Manage stored Todoist accounts (multi-user)')

    // `list` and `use`/`default` delegate to cli-core's generic account
    // attachers (consuming `store.list()` / `store.setDefault()`); `current`
    // and `remove` stay hand-rolled — cli-core ships no attacher for them.
    const store = createTodoistTokenStore()
    attachTodoistUserListCommand(account, store)
    attachTodoistUserUseCommand(account, store)

    account
        .command('current')
        .description('Show the active account (resolved from --user, default, or single login)')
        .option('--json', 'Output as JSON')
        .action(currentUserCommand)

    account
        .command('remove <ref>')
        .description('Remove a stored account (deletes its token and config entry)')
        .action((ref: string) => removeUserCommand(ref))

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
