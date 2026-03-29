import chalk from 'chalk'
import open from 'open'
import { saveApiToken } from '../../lib/auth.js'
import { startCallbackServer } from '../../lib/oauth-server.js'
import { buildAuthorizationUrl, exchangeCodeForToken } from '../../lib/oauth.js'
import { generateCodeChallenge, generateCodeVerifier, generateState } from '../../lib/pkce.js'
import { logTokenStorageResult } from './helpers.js'

export async function loginWithOAuth(): Promise<void> {
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = generateCodeChallenge(codeVerifier)
    const state = generateState()

    console.log('Opening browser for Todoist authorization...')

    const authUrl = buildAuthorizationUrl(codeChallenge, state)
    const { promise: callbackPromise, cleanup } = startCallbackServer(state)

    try {
        await open(authUrl)
        console.log(chalk.dim('Waiting for authorization...'))

        const code = await callbackPromise
        console.log(chalk.dim('Exchanging code for token...'))

        const accessToken = await exchangeCodeForToken(code, codeVerifier)
        const result = await saveApiToken(accessToken)

        console.log(chalk.green('✓'), 'Successfully logged in!')
        logTokenStorageResult(result, 'Token stored securely in the system credential manager')
    } catch (error) {
        cleanup()
        throw error
    }
}
