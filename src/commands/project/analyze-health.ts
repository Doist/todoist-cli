import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { printDryRun } from '../../lib/output.js'
import { resolveProjectRef } from '../../lib/refs.js'

export async function analyzeHealth(
    ref: string,
    options: { json?: boolean; dryRun?: boolean },
): Promise<void> {
    const api = await getApi()
    const project = await resolveProjectRef(api, ref)

    if (options.dryRun) {
        printDryRun('trigger health analysis', { Project: project.name })
        return
    }

    const health = await api.analyzeProjectHealth(project.id)

    if (options.json) {
        console.log(JSON.stringify(health, null, 2))
        return
    }

    console.log(`Triggered health analysis for "${project.name}"`)
    console.log(
        chalk.dim(
            `Analysis is in progress. Run 'td project health "${project.name}"' to check results.`,
        ),
    )
}
