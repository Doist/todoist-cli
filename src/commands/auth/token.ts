import chalk from 'chalk'
import { saveApiToken } from '../../lib/auth.js'
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
    const result = await saveApiToken(token.trim())
    console.log(chalk.green('✓'), 'API token saved successfully!')
    logTokenStorageResult(result, 'Token stored securely in the system credential manager')
}
