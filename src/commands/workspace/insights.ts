import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { formatHealthStatus, formatProgressBar } from '../../lib/output.js'
import { paginate } from '../../lib/pagination.js'
import { lenientIdRef, resolveWorkspaceRef } from '../../lib/refs.js'

export async function showWorkspaceInsights(
    ref: string,
    options: { json?: boolean; projectIds?: string },
): Promise<void> {
    const workspace = await resolveWorkspaceRef(ref)
    const api = await getApi()

    const args: { projectIds?: string[] } = {}
    if (options.projectIds) {
        args.projectIds = options.projectIds
            .split(',')
            .map((id) => lenientIdRef(id.trim(), 'project'))
    }

    const insights = await api.getWorkspaceInsights(workspace.id, args)

    if (options.json) {
        console.log(JSON.stringify(insights, null, 2))
        return
    }

    // Build a project name map from workspace-specific projects
    const { results: workspaceProjects } = await paginate(
        (cursor, limit) =>
            api.getWorkspaceActiveProjects({
                workspaceId: parseInt(workspace.id, 10),
                cursor: cursor ?? undefined,
                limit,
            }),
        { limit: Number.MAX_SAFE_INTEGER },
    )
    const projectMap = new Map(workspaceProjects.map((p) => [p.id, p.name]))

    console.log(chalk.bold(`Workspace: ${workspace.name}`))
    console.log('')

    if (insights.projectInsights.length === 0) {
        console.log(chalk.dim('No project insights available.'))
        return
    }

    console.log(`Project Insights (${insights.projectInsights.length}):`)
    console.log('')

    for (const pi of insights.projectInsights) {
        const name = projectMap.get(pi.projectId) ?? `id:${pi.projectId}`
        console.log(`  ${chalk.bold(name)}`)

        if (pi.health) {
            console.log(`    Health:   ${formatHealthStatus(pi.health.status)}`)
        } else {
            console.log(`    Health:   ${chalk.dim('N/A')}`)
        }

        if (pi.progress) {
            const total = pi.progress.completedCount + pi.progress.activeCount
            console.log(
                `    Progress: ${formatProgressBar(pi.progress.progressPercent)} (${pi.progress.completedCount}/${total})`,
            )
        } else {
            console.log(`    Progress: ${chalk.dim('N/A')}`)
        }

        console.log('')
    }
}
