import { Command } from 'commander'
import { listUsersCommand } from './list.js'
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

    user.addHelpText(
        'after',
        `
Examples:
  $ td auth login                 # add an account (sets it as default if first)
  $ td user list                  # see all stored accounts
  $ td user use scott@doist.com   # set default
  $ td --user other@example.com task list   # one-off override`,
    )
}
