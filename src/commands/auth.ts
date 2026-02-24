import { createInterface } from 'node:readline'
import chalk from 'chalk'
import { Command } from 'commander'
import open from 'open'
import { getApi } from '../lib/api/core.js'
import { clearApiToken, saveApiToken } from '../lib/auth.js'
import { buildAuthorizationUrl, exchangeCodeForToken } from '../lib/oauth.js'
import { startCallbackServer } from '../lib/oauth-server.js'
import { generateCodeChallenge, generateCodeVerifier, generateState } from '../lib/pkce.js'
import { clearSyncCache } from '../lib/sync/engine.js'

function promptHiddenInput(prompt: string): Promise<string> {
    return new Promise((resolve) => {
        const rl = createInterface({
            input: process.stdin,
            output: process.stdout,
        })
        // biome-ignore lint/suspicious/noExplicitAny: accessing private readline property
        const origWrite = (rl as any)._writeToOutput
        // biome-ignore lint/suspicious/noExplicitAny: accessing private readline property
        ;(rl as any)._writeToOutput = (str: string) => {
            if (str.includes(prompt)) {
                origWrite.call(rl, prompt)
            }
        }
        rl.question(prompt, (answer) => {
            rl.close()
            process.stdout.write('\n')
            resolve(answer)
        })
    })
}

async function loginWithToken(token?: string): Promise<void> {
    if (!token) {
        token = await promptHiddenInput('API token: ')
        if (!token.trim()) {
            console.error(chalk.red('Error:'), 'No token provided')
            process.exitCode = 1
            return
        }
    }
    await saveApiToken(token.trim())
    console.log(chalk.green('✓'), 'API token saved successfully!')
    console.log(chalk.dim('Token saved to ~/.config/todoist-cli/config.json'))
}

async function loginWithOAuth(): Promise<void> {
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
        await saveApiToken(accessToken)

        console.log(chalk.green('✓'), 'Successfully logged in!')
        console.log(chalk.dim('Token saved to ~/.config/todoist-cli/config.json'))
    } catch (error) {
        cleanup()
        throw error
    }
}

async function showStatus(): Promise<void> {
    try {
        const api = await getApi()
        const user = await api.getUser()
        console.log(chalk.green('✓'), 'Authenticated')
        console.log(`  Email: ${user.email}`)
        console.log(`  Name:  ${user.fullName}`)
    } catch {
        console.log(chalk.yellow('Not authenticated'))
        console.log(chalk.dim('Run `td auth login` or `td auth token <token>` to authenticate'))
    }
}

async function logout(): Promise<void> {
    await clearSyncCache()
    await clearApiToken()
    console.log(chalk.green('✓'), 'Logged out')
    console.log(chalk.dim('Token removed from ~/.config/todoist-cli/config.json'))
}

export function registerAuthCommand(program: Command): void {
    const auth = program.command('auth').description('Manage authentication')

    auth.command('login').description('Authenticate with Todoist via OAuth').action(loginWithOAuth)

    auth.command('token [token]')
        .description('Save API token to config file (manual authentication)')
        .action(loginWithToken)

    auth.command('status').description('Show current authentication status').action(showStatus)

    auth.command('logout').description('Remove saved authentication token').action(logout)
}
