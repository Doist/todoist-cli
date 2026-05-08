import { printEmpty } from '@doist/cli-core'
import chalk from 'chalk'
import { listStoredUsers, readConfig } from '../../lib/auth.js'
import { isAccessible } from '../../lib/global-args.js'
import { getDefaultUserId } from '../../lib/users.js'

export interface ListUsersOptions {
    json?: boolean
    ndjson?: boolean
}

export async function listUsersCommand(options: ListUsersOptions): Promise<void> {
    const users = await listStoredUsers()
    const config = await readConfig()
    const defaultId = getDefaultUserId(config)

    if (users.length === 0) {
        printEmpty({
            options,
            message: chalk.dim('No stored Todoist accounts. Run `td auth login` to add one.'),
        })
        return
    }

    const projected = users.map((u) => ({
        id: u.id,
        email: u.email,
        isDefault: u.id === defaultId,
        authMode: u.auth_mode,
        authScope: u.auth_scope,
        authFlags: u.auth_flags,
        storage: u.api_token ? 'config-file' : 'secure-store',
    }))

    if (options.json) {
        console.log(JSON.stringify(projected, null, 2))
        return
    }

    if (options.ndjson) {
        console.log(projected.map((u) => JSON.stringify(u)).join('\n'))
        return
    }

    const accessible = isAccessible()
    for (const u of users) {
        const isDefault = u.id === defaultId
        const marker = isDefault ? (accessible ? ' [default]' : chalk.green(' (default)')) : ''
        console.log(`${u.email} ${chalk.dim(`(id:${u.id})`)}${marker}`)
    }
}
