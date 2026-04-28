import { Command } from 'commander'
import { currentUserCommand } from './current.js'
import { listUsersCommand } from './list.js'
import { removeUserCommand } from './remove.js'
import { useUserCommand } from './use.js'

export function registerUserCommand(program: Command): void {
    const user = program.command('user').description('Manage stored Todoist accounts (multi-user)')

    user.command('list')
        .description('List all stored Todoist accounts')
        .option('--json', 'Output as JSON')
        .action(listUsersCommand)

    user.command('use <ref>')
        .description('Set the default account used when --user is not provided')
        .action((ref: string) => useUserCommand(ref))

    // `default` is an explicit alias for `use` — same behavior, different verb.
    user.command('default <ref>')
        .description('Alias of `td user use <ref>`')
        .action((ref: string) => useUserCommand(ref))

    user.command('current')
        .description('Show the active account (resolved from --user, default, or single login)')
        .option('--json', 'Output as JSON')
        .action(currentUserCommand)

    user.command('remove <ref>')
        .description('Remove a stored account (deletes its token and config entry)')
        .action((ref: string) => removeUserCommand(ref))

    user.addHelpText(
        'after',
        `
Examples:
  $ td auth login                 # add an account (sets it as default if first)
  $ td user list                  # see all stored accounts
  $ td user use scott@doist.com   # set default
  $ td user current               # show the active account
  $ td --user other@example.com task list   # one-off override
  $ td user remove old@example.com`,
    )
}
