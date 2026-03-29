import chalk from 'chalk'
import { clearApiToken } from '../../lib/auth.js'
import { logTokenStorageResult } from './helpers.js'

export async function logout(): Promise<void> {
    const result = await clearApiToken()
    console.log(chalk.green('✓'), 'Logged out')
    logTokenStorageResult(result, 'Stored token removed from the system credential manager')
}
