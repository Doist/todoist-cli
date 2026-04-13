import { Command } from 'commander'
import { downloadBackup } from './download.js'
import { listBackups } from './list.js'

export function registerBackupCommand(program: Command): void {
    const backup = program
        .command('backup')
        .description('Manage backups')
        .addHelpText(
            'after',
            `
Examples:
  td backup list
  td backup list --json
  td backup download "2024-01-15_12:00" --output-file backup.zip

Requires authenticating with the backups:read scope:
  td auth login --backups`,
        )

    backup
        .command('list')
        .description('List available backups')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .action(listBackups)

    const downloadCmd = backup
        .command('download [version]')
        .description('Download a backup file')
        .requiredOption('--output-file <path>', 'Output file path')
        .action((version, options) => {
            if (!version) {
                downloadCmd.help()
                return
            }
            return downloadBackup(version, options)
        })
}
