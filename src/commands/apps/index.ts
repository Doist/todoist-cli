import { Command } from 'commander'
import { listApps } from './list.js'

export function registerAppsCommand(program: Command): void {
    const apps = program
        .command('apps')
        .description('Manage your registered Todoist developer apps')
        .addHelpText(
            'after',
            `
Examples:
  td apps list
  td apps list --json

Requires authenticating with the dev:app_console scope:
  td auth login --app-management`,
        )

    apps.command('list')
        .description('List your registered Todoist apps')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .action(listApps)
}
