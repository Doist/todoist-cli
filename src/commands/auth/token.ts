import chalk from 'chalk'
import { createApiForToken } from '../../lib/api/core.js'
import { upsertUser } from '../../lib/auth.js'
import { logTokenStorageResult, promptHiddenInput } from './helpers.js'

export async function loginWithToken(token?: string): Promise<void> {
    if (!token) {
        token = await promptHiddenInput('API token: ')
        if (!token.trim()) {
            console.error(chalk.red('Error:'), 'No token provided')
            process.exitCode = 1
            return
        }
    }
    const trimmed = token.trim()

    // Identify the account behind the token so it lands in the right user slot.
    const probeApi = createApiForToken(trimmed)
    const user = await probeApi.getUser()

    const result = await upsertUser({
        id: user.id,
        email: user.email,
        token: trimmed,
        authMode: 'unknown',
    })

    const verb = result.replaced ? 'Updated stored token for' : 'Saved token for'
    console.log(chalk.green('✓'), `${verb} ${user.email}`)
    logTokenStorageResult(result, 'Token stored securely in the system credential manager')
}
