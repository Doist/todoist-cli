import chalk from 'chalk'
import { createApiForToken } from '../../lib/api/core.js'
import { createTodoistTokenStore, toTodoistAccount } from '../../lib/auth-store.js'
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

    const store = createTodoistTokenStore()
    await store.set(
        toTodoistAccount({ id: user.id, email: user.email, authMode: 'unknown' }),
        trimmed,
    )

    console.log(chalk.green('✓'), `Saved token for ${user.email}`)
    const result = store.getLastStorageResult()
    if (result) {
        logTokenStorageResult(result, 'Token stored securely in the system credential manager')
    }
}
