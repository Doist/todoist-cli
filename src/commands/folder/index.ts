import { Command } from 'commander'
import { CURSOR_DESCRIPTION } from '../../lib/constants.js'
import { CliError } from '../../lib/errors.js'
import type { PaginatedViewOptions } from '../../lib/options.js'
import { createFolder } from './create.js'
import { deleteFolder } from './delete.js'
import { listFolders } from './list.js'
import { updateFolder } from './update.js'
import { viewFolder } from './view.js'

export function registerFolderCommand(program: Command): void {
    const folder = program
        .command('folder')
        .description('Manage workspace folders')
        .addHelpText(
            'after',
            `
Examples:
  td folder list "Acme"
  td folder view "Engineering"
  td folder create "Acme" --name "Engineering"
  td folder delete "Engineering" --workspace "Acme" --yes`,
        )

    const listCmd = folder
        .command('list [workspace]')
        .description('List folders in a workspace')
        .option('--workspace <ref>', 'Workspace name or id:xxx')
        .option('--limit <n>', 'Limit number of results')
        .option('--cursor <cursor>', CURSOR_DESCRIPTION)
        .option('--all', 'Fetch all results (no limit)')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .action(
            (
                refArg: string | undefined,
                options: PaginatedViewOptions & { workspace?: string },
            ) => {
                if (refArg && options.workspace) {
                    throw new CliError(
                        'CONFLICTING_OPTIONS',
                        'Cannot specify workspace both as argument and --workspace flag',
                    )
                }
                const ref = refArg || options.workspace
                if (!ref) {
                    listCmd.help()
                    return
                }
                return listFolders(ref, options)
            },
        )

    folder
        .command('view [ref]', { isDefault: true })
        .description('View folder details and contained projects')
        .option('--workspace <ref>', 'Workspace name or id:xxx (for name-based lookup)')
        .option('--json', 'Output as JSON')
        .option('--full', 'Include all fields in JSON output')
        .action((ref, options) => {
            if (!ref) {
                folder.help()
                return
            }
            return viewFolder(ref, options)
        })

    const createCmd = folder
        .command('create [workspace]')
        .description('Create a folder')
        .option('--workspace <ref>', 'Workspace name or id:xxx')
        .option('--name <name>', 'Folder name (required)')
        .option('--default-order <n>', 'Default order for projects in the folder')
        .option('--child-order <n>', 'Order position of the folder')
        .option('--json', 'Output the created folder as JSON')
        .option('--dry-run', 'Preview what would happen without executing')
        .action(
            (
                refArg: string | undefined,
                options: {
                    workspace?: string
                    name?: string
                    defaultOrder?: string
                    childOrder?: string
                    json?: boolean
                    dryRun?: boolean
                },
            ) => {
                if (refArg && options.workspace) {
                    throw new CliError(
                        'CONFLICTING_OPTIONS',
                        'Cannot specify workspace both as argument and --workspace flag',
                    )
                }
                const ref = refArg || options.workspace
                if (!ref || !options.name) {
                    createCmd.help()
                    return
                }
                return createFolder(ref, options as { name: string } & typeof options)
            },
        )

    const updateCmd = folder
        .command('update [ref]')
        .description('Update a folder')
        .option('--workspace <ref>', 'Workspace name or id:xxx (for name-based lookup)')
        .option('--name <name>', 'New folder name')
        .option('--default-order <n>', 'New default order for projects')
        .option('--json', 'Output the updated folder as JSON')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((ref, options) => {
            if (!ref) {
                updateCmd.help()
                return
            }
            return updateFolder(ref, options)
        })

    const deleteCmd = folder
        .command('delete [ref]')
        .description('Delete a folder')
        .option('--workspace <ref>', 'Workspace name or id:xxx (for name-based lookup)')
        .option('--yes', 'Confirm deletion')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((ref, options) => {
            if (!ref) {
                deleteCmd.help()
                return
            }
            return deleteFolder(ref, options)
        })
}
