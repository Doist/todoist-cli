import { fetchUserStatus } from '../../lib/api/user-status.js'
import type { ViewOptions } from '../../lib/options.js'
import { formatStatus } from '../../lib/status.js'
import { formatStatusJson } from './helpers.js'

export async function showStatus(options: ViewOptions): Promise<void> {
    const status = await fetchUserStatus()

    if (options.json) {
        console.log(formatStatusJson(status))
        return
    }

    console.log(status ? formatStatus(status) : 'No status set.')
}
