import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { formatHealthStatus } from '../../lib/output.js'
import { resolveProjectRef } from '../../lib/refs.js'

export async function showProjectHealth(ref: string, options: { json?: boolean }): Promise<void> {
    const api = await getApi()
    const project = await resolveProjectRef(api, ref)
    const health = await api.getProjectHealth(project.id)

    if (options.json) {
        console.log(JSON.stringify(health, null, 2))
        return
    }

    console.log(chalk.bold(project.name))
    console.log('')

    let statusLine = `Health: ${formatHealthStatus(health.status)}`
    if (health.isStale) {
        statusLine += chalk.dim(
            `  (stale - run 'td project analyze-health "${project.name}"' to refresh)`,
        )
    }
    if (health.updateInProgress) {
        statusLine += chalk.dim('  (analysis in progress...)')
    }
    console.log(statusLine)

    if (health.updatedAt) {
        console.log(`  Updated: ${health.updatedAt}`)
    }

    if (health.description) {
        console.log('')
        console.log('  Summary:')
        console.log(`  ${health.description}`)
    }

    if (health.taskRecommendations && health.taskRecommendations.length > 0) {
        console.log('')
        console.log('  Recommendations:')
        for (const rec of health.taskRecommendations) {
            console.log(`  - ${chalk.dim(`id:${rec.taskId}`)}: ${rec.recommendation}`)
        }
    }
}
