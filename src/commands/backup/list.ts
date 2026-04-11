import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { CliError } from '../../lib/errors.js'

interface ListBackupsOptions {
    json?: boolean
    ndjson?: boolean
}

export async function listBackups(options: ListBackupsOptions): Promise<void> {
    const api = await getApi()

    let backups
    try {
        backups = await api.getBackups()
    } catch (error) {
        if (error instanceof CliError && error.code === 'AUTH_ERROR') {
            throw new CliError(
                'AUTH_ERROR',
                'Failed to access backups. Your token may be missing the backups:read scope.',
                [
                    'Re-authenticate to grant backup access: td auth login',
                    'If using an API token, ensure it has the backups:read scope',
                ],
            )
        }
        throw error
    }

    if (options.json) {
        console.log(JSON.stringify({ results: backups }, null, 2))
        return
    }

    if (options.ndjson) {
        for (const backup of backups) {
            console.log(JSON.stringify({ _type: 'backup', ...backup }))
        }
        return
    }

    if (backups.length === 0) {
        console.log('No backups found.')
        return
    }

    for (const backup of backups) {
        console.log(`${backup.version}  ${chalk.dim(backup.url)}`)
    }
}
