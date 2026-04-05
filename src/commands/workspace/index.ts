import { Command, Option } from 'commander'
import { withUnvalidatedChoices } from '../../lib/completion.js'
import { CliError } from '../../lib/errors.js'
import type { PaginatedViewOptions } from '../../lib/options.js'
import { WORKSPACE_ROLES } from './helpers.js'
import { showWorkspaceInsights } from './insights.js'
import { listWorkspaces } from './list.js'
import { listWorkspaceProjects } from './projects.js'
import { listWorkspaceUsers } from './users.js'
import { viewWorkspace } from './view.js'

export function registerWorkspaceCommand(program: Command): void {
    const workspace = program.command('workspace').description('Manage workspaces')

    workspace
        .command('list')
        .description('List all workspaces')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .action(listWorkspaces)

    workspace
        .command('view [ref]', { isDefault: true })
        .description('View workspace details')
        .option('--json', 'Output as JSON')
        .option('--full', 'Include all fields in JSON output')
        .action((ref, options) => {
            if (!ref) {
                workspace.help()
                return
            }
            return viewWorkspace(ref, options)
        })

    const projectsCmd = workspace
        .command('projects [ref]')
        .description('List projects in a workspace')
        .option('--workspace <ref>', 'Workspace name or id:xxx')
        .option('--limit <n>', 'Limit number of results')
        .option('--cursor <cursor>', 'Continue from cursor')
        .option('--all', 'Fetch all results (no limit)')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
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
                    projectsCmd.help()
                    return
                }
                return listWorkspaceProjects(ref, options)
            },
        )

    const usersCmd = workspace
        .command('users [ref]')
        .description('List users in a workspace')
        .option('--workspace <ref>', 'Workspace name or id:xxx')
        .addOption(
            withUnvalidatedChoices(
                new Option(
                    '--role <roles>',
                    `Filter by role (comma-separated: ${WORKSPACE_ROLES.join(',')})`,
                ),
                WORKSPACE_ROLES,
            ),
        )
        .option('--limit <n>', 'Limit number of results')
        .option('--cursor <cursor>', 'Continue from cursor')
        .option('--all', 'Fetch all results (no limit)')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .action(
            (
                refArg: string | undefined,
                options: PaginatedViewOptions & { role?: string; workspace?: string },
            ) => {
                if (refArg && options.workspace) {
                    throw new CliError(
                        'CONFLICTING_OPTIONS',
                        'Cannot specify workspace both as argument and --workspace flag',
                    )
                }
                const ref = refArg || options.workspace
                if (!ref) {
                    usersCmd.help()
                    return
                }
                return listWorkspaceUsers(ref, options)
            },
        )

    const insightsCmd = workspace
        .command('insights [ref]')
        .description('Show health and progress insights for workspace projects')
        .option('--workspace <ref>', 'Workspace name or id:xxx')
        .option('--json', 'Output as JSON')
        .option('--project-ids <ids>', 'Comma-separated project IDs to filter')
        .action(
            (
                refArg: string | undefined,
                options: { json?: boolean; projectIds?: string; workspace?: string },
            ) => {
                if (refArg && options.workspace) {
                    throw new CliError(
                        'CONFLICTING_OPTIONS',
                        'Cannot specify workspace both as argument and --workspace flag',
                    )
                }
                const ref = refArg || options.workspace
                if (!ref) {
                    insightsCmd.help()
                    return
                }
                return showWorkspaceInsights(ref, options)
            },
        )
}
