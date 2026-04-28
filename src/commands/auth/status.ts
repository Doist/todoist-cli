import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { type AuthMode, getAuthMetadata, listStoredUsers, readConfig } from '../../lib/auth.js'
import { getDefaultUserId } from '../../lib/users.js'

function formatAuthMode(authMode: AuthMode, authScope?: string): string {
    if (authMode === 'read-only') {
        return `read-only (OAuth scope ${authScope ?? 'data:read'})`
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
    const config = await readConfig()
    const storedUsers = await listStoredUsers()
    const defaultUserId = getDefaultUserId(config)
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
                    authFlags: metadata.authFlags,
                    source: metadata.source,
                    isDefault: defaultUserId === user.id,
                    storedUsers: storedUsers.map((u) => ({
                        id: u.id,
                        email: u.email,
                        isDefault: defaultUserId === u.id,
                    })),
                },
                null,
                2,
            ),
        )
        return
    }

    // env source wins over default: when running with TODOIST_API_TOKEN,
    // showing `(default)` would hide the more important "this is an env
    // override, not your stored credential" signal.
    const defaultMarker =
        metadata.source === 'env'
            ? ' (TODOIST_API_TOKEN)'
            : defaultUserId === user.id
              ? ' (default)'
              : ''
    console.log(chalk.green('✓'), `Authenticated${defaultMarker}`)
    console.log(`  Email: ${user.email}`)
    console.log(`  Name:  ${user.fullName}`)
    console.log(`  Mode:  ${modeLabel}`)

    const others = storedUsers.filter((u) => u.id !== user.id)
    if (others.length > 0) {
        console.log()
        console.log(chalk.dim(`Other stored accounts (${others.length}):`))
        for (const other of others) {
            const marker = other.id === defaultUserId ? chalk.dim(' (default)') : ''
            console.log(`  ${other.email} ${chalk.dim(`(id:${other.id})`)}${marker}`)
        }
        console.log(
            chalk.dim(
                'Use `td user use <id|email>` to switch default, or `--user <ref>` per command.',
            ),
        )
    }
}
