import chalk from 'chalk'
import open from 'open'
import { saveApiToken, type AuthFlag } from '../../lib/auth.js'
import { startCallbackServer } from '../../lib/oauth-server.js'
import { buildAuthorizationUrl, exchangeCodeForToken, resolveAuthScope } from '../../lib/oauth.js'
import { generateCodeChallenge, generateCodeVerifier, generateState } from '../../lib/pkce.js'
import { logTokenStorageResult } from './helpers.js'

export async function loginWithOAuth(
    options: { readOnly?: boolean; appManagement?: boolean; backups?: boolean } = {},
): Promise<void> {
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = generateCodeChallenge(codeVerifier)
    const state = generateState()

    console.log('Opening browser for Todoist authorization...')

    const { promise: callbackPromise, port, cleanup } = await startCallbackServer(state)
    const authUrl = buildAuthorizationUrl(codeChallenge, state, {
        readOnly: options.readOnly,
        appManagement: options.appManagement,
        backups: options.backups,
        port,
    })

    try {
        await open(authUrl)
        console.log(chalk.dim('Waiting for authorization...'))

        const code = await callbackPromise
        console.log(chalk.dim('Exchanging code for token...'))

        const accessToken = await exchangeCodeForToken(code, codeVerifier, port)
        const authFlags: AuthFlag[] = []
        if (options.readOnly) authFlags.push('read-only')
        if (options.appManagement) authFlags.push('app-management')
        if (options.backups) authFlags.push('backups')
        const result = await saveApiToken(accessToken, {
            authMode: options.readOnly ? 'read-only' : 'read-write',
            authScope: resolveAuthScope(options),
            authFlags,
        })

        console.log(chalk.green('✓'), 'Successfully logged in!')
        logTokenStorageResult(result, 'Token stored securely in the system credential manager')
    } catch (error) {
        cleanup()
        throw error
    }
}
