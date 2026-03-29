import { fetchProductivityStats } from '../../lib/api/stats.js'
import type { ViewOptions } from '../../lib/options.js'
import { formatStatsJson, formatStatsView } from './helpers.js'

export async function viewStats(options: ViewOptions): Promise<void> {
    const stats = await fetchProductivityStats()

    if (options.json) {
        console.log(JSON.stringify(formatStatsJson(stats, options.full ?? false), null, 2))
        return
    }

    console.log(formatStatsView(stats))
}
