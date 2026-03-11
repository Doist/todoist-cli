import { createInterface } from 'node:readline'
import chalk from 'chalk'
import { Command } from 'commander'
import open from 'open'
import { getApi } from '../lib/api/core.js'
import { clearApiToken, saveApiToken, type TokenStorageResult } from '../lib/auth.js'
import { startCallbackServer } from '../lib/oauth-server.js'
import { buildAuthorizationUrl, exchangeCodeForToken } from '../lib/oauth.js'
import { generateCodeChallenge, generateCodeVerifier, generateState } from '../lib/pkce.js'

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
    const result = await saveApiToken(token.trim())
    console.log(chalk.green('✓'), 'API token saved successfully!')
    logTokenStorageResult(result, 'Token stored securely in the system credential manager')
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
        const result = await saveApiToken(accessToken)

        console.log(chalk.green('✓'), 'Successfully logged in!')
        logTokenStorageResult(result, 'Token stored securely in the system credential manager')
    } catch (error) {
        cleanup()
        throw error
    }
}

async function showStatus(options: { json?: boolean }): Promise<void> {
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
    } catch {
        if (options.json) {
            console.log(JSON.stringify({ error: 'Not authenticated' }, null, 2))
            process.exitCode = 1
        } else {
            console.log(chalk.yellow('Not authenticated'))
            console.log(chalk.dim('Run `td auth login` or `td auth token <token>` to authenticate'))
        }
    }
}

async function logout(): Promise<void> {
    const result = await clearApiToken()
    console.log(chalk.green('✓'), 'Logged out')
    logTokenStorageResult(result, 'Stored token removed from the system credential manager')
}

function logTokenStorageResult(result: TokenStorageResult, secureStoreMessage: string): void {
    if (result.storage === 'secure-store') {
        console.log(chalk.dim(secureStoreMessage))
    }

    if (result.warning) {
        console.error(chalk.yellow('Warning:'), result.warning)
    }
}

export function registerAuthCommand(program: Command): void {
    const auth = program.command('auth').description('Manage authentication')

    auth.command('login').description('Authenticate with Todoist via OAuth').action(loginWithOAuth)

    auth.command('token [token]')
        .description('Save API token for CLI authentication')
        .action(loginWithToken)

    auth.command('status')
        .description('Show current authentication status')
        .option('--json', 'Output as JSON')
        .action(showStatus)

    auth.command('logout').description('Remove saved authentication token').action(logout)
}
