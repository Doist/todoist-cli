import { Command } from 'commander'
import { listApps } from './list.js'
import { updateApp } from './update.js'
import { viewApp } from './view.js'

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
  td apps view "Todoist for VS Code"
  td apps view id:9909
  td apps view 9909
  td apps view id:9909 --include-secrets
  td apps view id:9909 --json --include-secrets
  td apps update id:9909 --add-oauth-redirect https://example.com/callback
  td apps update id:9909 --remove-oauth-redirect https://example.com/callback --yes

Sensitive values (client id, client secret, verification token, test token,
distribution token) are hidden by default. Pass --include-secrets to fetch
and reveal them — they are not pulled onto your machine unless you do.

Requires authenticating with the dev:app_console scope:
  td auth login --additional-scopes=app-management`,
        )

    apps.command('list')
        .description('List your registered Todoist apps')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .action(listApps)

    apps.command('view [ref]', { isDefault: true })
        .description('View details for a single app (by name, id:N, or raw id)')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option(
            '--include-secrets',
            'Reveal sensitive values (client secret, verification token, test token, distribution token). Hidden by default.',
        )
        .action((ref, options) => {
            if (!ref) {
                apps.help()
                return
            }
            return viewApp(ref, options)
        })

    const updateCmd = apps
        .command('update [ref]')
        .description('Update a single app (by name, id:N, or raw id)')
        .option('--add-oauth-redirect <url>', 'Add an OAuth redirect URI to the app')
        .option(
            '--remove-oauth-redirect <url>',
            'Remove an OAuth redirect URI from the app (requires --yes)',
        )
        .option('--yes', 'Confirm destructive changes (required for --remove-oauth-redirect)')
        .option('--dry-run', 'Preview what would happen without executing')
        .option('--json', 'Output the updated app as JSON')
        .action((ref, options) => {
            if (!ref) {
                updateCmd.help()
                return
            }
            return updateApp(ref, options)
        })
}
