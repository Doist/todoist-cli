import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { NoTokenError } from '../../lib/auth.js'

export async function showStatus(options: { json?: boolean }): Promise<void> {
    try {
        const api = await getApi()
        const user = await api.getUser()
        if (options.json) {
            console.log(
                JSON.stringify(
                    { id: user.id, email: user.email, fullName: user.fullName },
                    null,
                    2,
                ),
            )
        } else {
            console.log(chalk.green('✓'), 'Authenticated')
            console.log(`  Email: ${user.email}`)
            console.log(`  Name:  ${user.fullName}`)
        }
    } catch (error) {
        const isAuthError = error instanceof NoTokenError
        if (options.json) {
            if (isAuthError) {
                console.log(JSON.stringify({ error: 'Not authenticated' }, null, 2))
                process.exitCode = 1
            } else {
                throw error
            }
        } else {
            if (isAuthError) {
                console.log(chalk.yellow('Not authenticated'))
                console.log(
                    chalk.dim('Run `td auth login` or `td auth token <token>` to authenticate'),
                )
            } else {
                throw error
            }
        }
    }
}
