import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { formatProgressBar } from '../../lib/output.js'
import { resolveProjectRef } from '../../lib/refs.js'

export async function showProjectProgress(ref: string, options: { json?: boolean }): Promise<void> {
    const api = await getApi()
    const project = await resolveProjectRef(api, ref)
    const progress = await api.getProjectProgress(project.id)

    if (options.json) {
        console.log(JSON.stringify(progress, null, 2))
        return
    }

    const total = progress.completedCount + progress.activeCount
    console.log(chalk.bold(project.name))
    console.log('')
    console.log(
        `Progress: ${formatProgressBar(progress.progressPercent)} (${progress.completedCount}/${total})`,
    )
    console.log(`  Completed: ${progress.completedCount}`)
    console.log(`  Active:    ${progress.activeCount}`)
}
