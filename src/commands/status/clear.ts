import { fetchUserStatus, writeUserStatus } from '../../lib/api/user-status.js'
import { CliError } from '../../lib/errors.js'
import { isQuiet } from '../../lib/global-args.js'
import type { DryRunOption } from '../../lib/options.js'
import { printDryRun } from '../../lib/output.js'
import { formatStatus } from '../../lib/status.js'

export async function clearStatus(options: DryRunOption): Promise<void> {
    if (options.dryRun) {
        const current = await fetchUserStatus()
        printDryRun('clear status', {
            Status: current ? formatStatus(current) : 'none set',
        })
        return
    }

    const status = await writeUserStatus(null)

    if (status) {
        throw new CliError(
            'INVALID_STATE',
            `Todoist still reports a status: ${formatStatus(status)}`,
        )
    }

    if (!isQuiet()) console.log('Status cleared.')
}
