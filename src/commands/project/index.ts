import { Command, Option } from 'commander'
import { withCaseInsensitiveChoices } from '../../lib/completion.js'
import { CURSOR_DESCRIPTION } from '../../lib/constants.js'
import { showProjectActivityStats } from './activity-stats.js'
import { analyzeHealth } from './analyze-health.js'
import { archiveProject } from './archive.js'
import { archivedCount } from './archived-count.js'
import { listArchivedProjects } from './archived.js'
import { browseProject } from './browse.js'
import { listCollaborators } from './collaborators.js'
import { createProject } from './create.js'
import { deleteProject } from './delete.js'
import { showProjectHealthContext } from './health-context.js'
import { showProjectHealth } from './health.js'
import { VIEW_STYLE_CHOICES } from './helpers.js'
import { joinProjectCmd } from './join.js'
import { listProjects } from './list.js'
import { moveProject } from './move.js'
import { showPermissions } from './permissions.js'
import { showProjectProgress } from './progress.js'
import { unarchiveProject } from './unarchive.js'
import { updateProject } from './update.js'
import { viewProject } from './view.js'

export { viewProject } from './view.js'

export function registerProjectCommand(program: Command): void {
    const project = program
        .command('project')
        .description('Manage projects')
        .addHelpText(
            'after',
            `
Examples:
  td project list
  td project create --name "New Project" --color blue
  td project view "Roadmap" --detailed`,
        )

    project
        .command('list')
        .description('List all projects, or search by name')
        .option('--search <query>', 'Search projects by name')
        .option('--limit <n>', 'Limit number of results (default: 50)')
        .option('--cursor <cursor>', CURSOR_DESCRIPTION)
        .option('--all', 'Fetch all results (no limit)')
        .option('--personal', 'Show only personal projects')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .option('--show-urls', 'Show web app URLs for each project')
        .action(listProjects)

    project
        .command('view [ref]', { isDefault: true })
        .description('View project details')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .option('--detailed', 'Include sections, collaborators, notes, and comment count')
        .option('--show-urls', 'Show web app URLs for each task')
        .action((ref, options) => {
            if (!ref) {
                project.help()
                return
            }
            return viewProject(ref, options)
        })

    const collaboratorsCmd = project
        .command('collaborators [ref]')
        .description('List project collaborators')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .action((ref, options) => {
            if (!ref) {
                collaboratorsCmd.help()
                return
            }
            return listCollaborators(ref, options)
        })

    const deleteCmd = project
        .command('delete [ref]')
        .description('Delete a project (must have no uncompleted tasks)')
        .option('--yes', 'Confirm deletion')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((ref, options) => {
            if (!ref) {
                deleteCmd.help()
                return
            }
            return deleteProject(ref, options)
        })

    const createCmd = project
        .command('create')
        .description('Create a project')
        .option('--name <name>', 'Project name (required)')
        .option('--color <color>', 'Project color')
        .option('--favorite', 'Mark as favorite')
        .option('--parent <ref>', 'Parent project (name or id:xxx)')
        .addOption(
            withCaseInsensitiveChoices(
                new Option('--view-style <style>', 'View style (list, board, or calendar)'),
                VIEW_STYLE_CHOICES,
            ),
        )
        .option('--json', 'Output the created project as JSON')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((options) => {
            if (!options.name) {
                createCmd.help()
                return
            }
            return createProject(options)
        })

    const updateCmd = project
        .command('update [ref]')
        .description('Update a project')
        .option('--name <name>', 'New name')
        .option('--color <color>', 'New color')
        .option('--favorite', 'Mark as favorite')
        .option('--no-favorite', 'Remove from favorites')
        .option('--folder <ref>', 'Move into a folder by name or id:xxx (workspace projects only)')
        .option('--no-folder', 'Remove from folder (workspace projects only)')
        .addOption(
            withCaseInsensitiveChoices(
                new Option('--view-style <style>', 'View style (list, board, or calendar)'),
                VIEW_STYLE_CHOICES,
            ),
        )
        .option('--json', 'Output the updated project as JSON')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((ref, options) => {
            if (!ref) {
                updateCmd.help()
                return
            }
            return updateProject(ref, options)
        })

    const archiveCmd = project
        .command('archive [ref]')
        .description('Archive a project')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((ref, options) => {
            if (!ref) {
                archiveCmd.help()
                return
            }
            return archiveProject(ref, options)
        })

    const unarchiveCmd = project
        .command('unarchive [ref]')
        .description('Unarchive a project')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((ref, options) => {
            if (!ref) {
                unarchiveCmd.help()
                return
            }
            return unarchiveProject(ref, options)
        })

    const browseCmd = project
        .command('browse [ref]')
        .description('Open project in browser')
        .action((ref) => {
            if (!ref) {
                browseCmd.help()
                return
            }
            return browseProject(ref)
        })

    const moveCmd = project
        .command('move [ref]')
        .description('Move project between personal and workspace')
        .option('--to-workspace <ref>', 'Target workspace (name or id:xxx)')
        .option('--to-personal', 'Move to personal')
        .option('--folder <ref>', 'Target folder in workspace (name or id:xxx)')
        .option('--visibility <level>', 'Access visibility (restricted, team, public)')
        .option('--yes', 'Confirm move')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((ref, options) => {
            if (!ref) {
                moveCmd.help()
                return
            }
            return moveProject(ref, options)
        })

    project
        .command('archived')
        .description('List archived projects')
        .option('--limit <n>', 'Limit number of results (default: 50)')
        .option('--cursor <cursor>', CURSOR_DESCRIPTION)
        .option('--all', 'Fetch all results (no limit)')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .option('--show-urls', 'Show web app URLs for each project')
        .action(listArchivedProjects)

    project
        .command('archived-count')
        .description('Count archived projects')
        .option('--workspace <ref>', 'Filter to a workspace (name or id:xxx)')
        .option('--joined', 'Count only joined projects')
        .option('--json', 'Output as JSON')
        .action(archivedCount)

    project
        .command('permissions')
        .description('Show project permission mappings by role')
        .option('--json', 'Output as JSON')
        .action(showPermissions)

    project
        .command('join <id>')
        .description('Join a shared project')
        .option('--json', 'Output the joined project as JSON')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((id, options) => {
            return joinProjectCmd(id, options)
        })

    const progressCmd = project
        .command('progress [ref]')
        .description('Show project completion progress')
        .option('--json', 'Output as JSON')
        .action((ref, options) => {
            if (!ref) {
                progressCmd.help()
                return
            }
            return showProjectProgress(ref, options)
        })

    const healthCmd = project
        .command('health [ref]')
        .description('Show project health status and recommendations')
        .option('--json', 'Output as JSON')
        .action((ref, options) => {
            if (!ref) {
                healthCmd.help()
                return
            }
            return showProjectHealth(ref, options)
        })

    const healthContextCmd = project
        .command('health-context [ref]')
        .description('Show detailed project metrics and task breakdown for health analysis')
        .option('--json', 'Output as JSON')
        .action((ref, options) => {
            if (!ref) {
                healthContextCmd.help()
                return
            }
            return showProjectHealthContext(ref, options)
        })

    const activityStatsCmd = project
        .command('activity-stats [ref]')
        .description('Show project activity statistics')
        .option('--json', 'Output as JSON')
        .option('--weeks <n>', 'Number of weeks of data (1-12)')
        .option('--include-weekly', 'Include weekly rollup counts')
        .action((ref, options) => {
            if (!ref) {
                activityStatsCmd.help()
                return
            }
            return showProjectActivityStats(ref, options)
        })

    const analyzeHealthCmd = project
        .command('analyze-health [ref]')
        .description('Trigger a new health analysis for a project')
        .option('--json', 'Output as JSON')
        .option('--dry-run', 'Preview what would happen without executing')
        .action((ref, options) => {
            if (!ref) {
                analyzeHealthCmd.help()
                return
            }
            return analyzeHealth(ref, options)
        })
}
