import { fetchUserStatus } from '../../lib/api/user-status.js'
import type { ViewOptions } from '../../lib/options.js'
import { formatJson } from '../../lib/output.js'
import { formatStatus } from '../../lib/status.js'

export async function viewStatus(options: ViewOptions): Promise<void> {
    const status = await fetchUserStatus()

    if (options.json) {
        console.log(formatJson({ status }))
        return
    }

    console.log(status ? formatStatus(status) : 'No status set.')
}
