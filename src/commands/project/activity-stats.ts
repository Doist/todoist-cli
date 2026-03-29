import type { GetProjectActivityStatsArgs } from '@doist/todoist-api-typescript'
import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { formatError } from '../../lib/output.js'
import { resolveProjectRef } from '../../lib/refs.js'

export async function showProjectActivityStats(
    ref: string,
    options: { json?: boolean; weeks?: string; includeWeekly?: boolean },
): Promise<void> {
    const api = await getApi()
    const project = await resolveProjectRef(api, ref)

    const args: GetProjectActivityStatsArgs = {}
    if (options.weeks) {
        const weeks = parseInt(options.weeks, 10)
        if (isNaN(weeks) || weeks < 1 || weeks > 12) {
            throw new Error(
                formatError(
                    'INVALID_WEEKS',
                    'The --weeks value must be a number between 1 and 12.',
                ),
            )
        }
        args.weeks = weeks
    }
    if (options.includeWeekly) args.includeWeeklyCounts = true

    const stats = await api.getProjectActivityStats(project.id, args)

    if (options.json) {
        console.log(JSON.stringify(stats, null, 2))
        return
    }

    console.log(chalk.bold(`${project.name} - Activity Stats`))

    if (stats.dayItems.length > 0) {
        console.log('')
        console.log('Daily:')
        for (const day of stats.dayItems) {
            const count = String(day.totalCount).padStart(4)
            console.log(`  ${day.date}  ${count} items`)
        }
    }

    if (stats.weekItems && stats.weekItems.length > 0) {
        console.log('')
        console.log('Weekly:')
        for (const week of stats.weekItems) {
            const count = String(week.totalCount).padStart(4)
            console.log(`  ${week.fromDate} to ${week.toDate}  ${count} items`)
        }
    }
}
