import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { formatPaginatedJson, formatPaginatedNdjson } from '../../lib/output.js'
import { fetchBackups } from './helpers.js'

interface ListBackupsOptions {
    json?: boolean
    ndjson?: boolean
}

export async function listBackups(options: ListBackupsOptions): Promise<void> {
    const api = await getApi()
    const backups = await fetchBackups(api)
    const paginated = { results: backups, nextCursor: null }

    if (options.json) {
        console.log(formatPaginatedJson(paginated))
        return
    }

    if (options.ndjson) {
        console.log(formatPaginatedNdjson(paginated))
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
