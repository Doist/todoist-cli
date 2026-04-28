import chalk from 'chalk'
import { readConfig, resolveActiveUser } from '../../lib/auth.js'
import { getDefaultUserId } from '../../lib/users.js'

export interface CurrentUserOptions {
    json?: boolean
}

export async function currentUserCommand(options: CurrentUserOptions): Promise<void> {
    const resolved = await resolveActiveUser()
    const config = await readConfig()
    const defaultId = getDefaultUserId(config)
    const isDefault = resolved.id === defaultId

    if (options.json) {
        console.log(
            JSON.stringify(
                {
                    id: resolved.id === 'env' || resolved.id === 'legacy' ? null : resolved.id,
                    email: resolved.email || null,
                    source: resolved.source,
                    isDefault,
                    authMode: resolved.authMode,
                    authScope: resolved.authScope,
                    authFlags: resolved.authFlags,
                },
                null,
                2,
            ),
        )
        return
    }

    if (resolved.source === 'env') {
        console.log(chalk.dim('Using TODOIST_API_TOKEN environment variable (no stored user).'))
        return
    }

    if (resolved.id === 'legacy') {
        console.log(
            chalk.dim(
                'Using legacy single-user credentials. Run `td auth login` to migrate to a stored account.',
            ),
        )
        return
    }

    const marker = isDefault ? chalk.green(' (default)') : ''
    console.log(`${resolved.email} ${chalk.dim(`(id:${resolved.id})`)}${marker}`)
}
