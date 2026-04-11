import type { Backup, TodoistApi } from '@doist/todoist-sdk'
import { getAuthMetadata } from '../../lib/auth.js'
import { CliError } from '../../lib/errors.js'

export async function fetchBackups(api: TodoistApi): Promise<Backup[]> {
    const metadata = await getAuthMetadata()
    if (metadata.authScope && !metadata.authScope.includes('backups:read')) {
        throw new CliError('AUTH_ERROR', 'Your current token is missing the backups:read scope', [
            'Re-authenticate to grant backup access: td auth login',
        ])
    }

    return api.getBackups()
}
