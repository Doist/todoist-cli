import { Command } from 'commander'
import { CliError } from '../../lib/errors.js'
import type { PaginatedViewOptions } from '../../lib/options.js'
import { parseOrderArg } from '../../lib/order.js'
import { archiveSection } from './archive.js'
import { browseSection } from './browse.js'
import { createSection } from './create.js'
import { deleteSection } from './delete.js'
import { listSections } from './list.js'
import { reorderSection } from './reorder.js'
import { unarchiveSection } from './unarchive.js'
import { updateSection } from './update.js'

export function registerSectionCommand(program: Command): void {
    const section = program.command('section').description('Manage project sections')

    const listCmd = section
        .command('list [project]')
        .description('List sections in a project, or search by name')
        .option('--project <ref>', 'Project name or id:xxx')
        .option('--search <query>', 'Search sections by name')
        .option('--limit <n>', 'Limit number of results (default: 300)')
        .option('--all', 'Fetch all results (no limit)')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .option('--show-urls', 'Show web app URLs for each section')
        .action(
            (
                projectArg: string | undefined,
                options: PaginatedViewOptions & { project?: string; search?: string },
            ) => {
                if (projectArg && options.project) {
                    throw new CliError(
                        'CONFLICTING_OPTIONS',
                        'Cannot specify project both as argument and --project flag',
                    )
                }
                const project = projectArg || options.project
                if (!project && !options.search) {
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
        .option('--description <text>', 'Section description (markdown)')
        .option('--stdin', 'Read section description from stdin')
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
        .option('--name <name>', 'New section name')
        .option(
            '--description <text>',
            'New description (markdown); pipe empty input via --stdin to clear',
        )
        .option('--stdin', 'Read section description from stdin')
        .option('--json', 'Output the updated section as JSON')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((id, options) => {
            if (!id) {
                updateCmd.help()
                return
            }
            return updateSection(id, options)
        })

    const reorderCmd = section
        .command('reorder [ref]')
        .description('Reorder a section within a project')
        .option('--section <ref>', 'Section name or id:xxx')
        .option('--project <ref>', 'Project name or id:xxx (required)')
        .option('--before <ref>', 'Place before this sibling section')
        .option('--after <ref>', 'Place after this sibling section')
        .option('--position <n>', 'Move to a 0-indexed position within the project', parseOrderArg)
        .option('--json', 'Output the new ordering as JSON')
        .option('--dry-run', 'Preview what would happen without executing')
        .addHelpText(
            'after',
            `
Examples:
  td section reorder "Review" --project "Roadmap" --before "Done"
  td section reorder "Review" --project "Roadmap" --after "In Progress"
  td section reorder --section "Review" --project "Roadmap" --position 0 --dry-run
  td section reorder "Review" --project "Roadmap" --position 2 --json`,
        )
        .action((ref, options) => {
            if (ref && options.section) {
                throw new CliError(
                    'CONFLICTING_OPTIONS',
                    'Cannot specify section both as argument and --section flag',
                )
            }
            const sectionRef = ref || options.section
            if (!sectionRef) {
                reorderCmd.help()
                return
            }
            return reorderSection(sectionRef, options)
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
