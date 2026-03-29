import { Command } from 'commander'
import type { PaginatedViewOptions } from '../../lib/options.js'
import { archiveSection } from './archive.js'
import { browseSection } from './browse.js'
import { createSection } from './create.js'
import { deleteSection } from './delete.js'
import { listSections } from './list.js'
import { unarchiveSection } from './unarchive.js'
import { updateSection } from './update.js'

export function registerSectionCommand(program: Command): void {
    const section = program.command('section').description('Manage project sections')

    const listCmd = section
        .command('list [project]')
        .description('List sections in a project')
        .option('--project <ref>', 'Project name or id:xxx')
        .option('--limit <n>', 'Limit number of results (default: 300)')
        .option('--all', 'Fetch all results (no limit)')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .option('--show-urls', 'Show web app URLs for each section')
        .action(
            (
                projectArg: string | undefined,
                options: PaginatedViewOptions & { project?: string },
            ) => {
                if (projectArg && options.project) {
                    throw new Error('Cannot specify project both as argument and --project flag')
                }
                const project = projectArg || options.project
                if (!project) {
                    listCmd.help()
                    return
                }
                return listSections(project, options)
            },
        )

    const createCmd = section
        .command('create')
        .description('Create a section')
        .option('--name <name>', 'Section name (required)')
        .option('--project <name>', 'Project name or id:xxx (required)')
        .option('--json', 'Output the created section as JSON')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((options) => {
            if (!options.name || !options.project) {
                createCmd.help()
                return
            }
            return createSection(options)
        })

    const deleteCmd = section
        .command('delete [id]')
        .description('Delete a section')
        .option('--yes', 'Confirm deletion')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((id, options) => {
            if (!id) {
                deleteCmd.help()
                return
            }
            return deleteSection(id, options)
        })

    const updateCmd = section
        .command('update [id]')
        .description('Update a section')
        .option('--name <name>', 'New section name (required)')
        .option('--json', 'Output the updated section as JSON')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((id, options) => {
            if (!id || !options.name) {
                updateCmd.help()
                return
            }
            return updateSection(id, options)
        })

    const archiveCmd = section
        .command('archive [id]')
        .description('Archive a section')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((id, options) => {
            if (!id) {
                archiveCmd.help()
                return
            }
            return archiveSection(id, options)
        })

    const unarchiveCmd = section
        .command('unarchive [id]')
        .description('Unarchive a section')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((id, options) => {
            if (!id) {
                unarchiveCmd.help()
                return
            }
            return unarchiveSection(id, options)
        })

    const browseCmd = section
        .command('browse [id]')
        .description('Open section in browser (requires id:xxx)')
        .action((id) => {
            if (!id) {
                browseCmd.help()
                return
            }
            return browseSection(id)
        })
}
