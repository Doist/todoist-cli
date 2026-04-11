import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { type AuthMode, getAuthMetadata } from '../../lib/auth.js'

function formatAuthMode(authMode: AuthMode, authScope?: string): string {
    if (authMode === 'read-only') {
        return `read-only (OAuth scope ${authScope ?? 'data:read,backups:read'})`
    }
    if (authMode === 'read-write') {
        return 'read-write'
    }
    return 'unknown (manual token or env var; assuming write access)'
}

export async function showStatus(options: { json?: boolean }): Promise<void> {
    const api = await getApi()
    const user = await api.getUser()
    const metadata = await getAuthMetadata()
    const modeLabel = formatAuthMode(metadata.authMode, metadata.authScope)

    if (options.json) {
        console.log(
            JSON.stringify(
                {
                    id: user.id,
                    email: user.email,
                    fullName: user.fullName,
                    authMode: metadata.authMode,
                    authScope: metadata.authScope,
                },
                null,
                2,
            ),
        )
    } else {
        console.log(chalk.green('✓'), 'Authenticated')
        console.log(`  Email: ${user.email}`)
        console.log(`  Name:  ${user.fullName}`)
        console.log(`  Mode:  ${modeLabel}`)
    }
}
