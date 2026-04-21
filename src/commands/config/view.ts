import chalk from 'chalk'
import { type AuthMetadata, NoTokenError, probeApiToken, TOKEN_ENV_VAR } from '../../lib/auth.js'
import { type Config, CONFIG_PATH, readConfig } from '../../lib/config.js'

export interface ViewConfigOptions {
    json?: boolean
    showToken?: boolean
}

interface TokenPresence {
    token: string
    source: AuthMetadata['source']
}

function maskToken(token: string): string {
    if (token.length < 5) return '****'
    return `****…${token.slice(-4)}`
}

function describeTokenSource(source: AuthMetadata['source']): string {
    switch (source) {
        case 'env':
            return `environment variable ${TOKEN_ENV_VAR}`
        case 'secure-store':
            return 'system credential manager'
        case 'config-file':
            return 'config file (plaintext fallback)'
    }
}

async function probeTokenPresence(): Promise<TokenPresence | null> {
    try {
        const { token, metadata } = await probeApiToken()
        return { token, source: metadata.source }
    } catch (error) {
        if (error instanceof NoTokenError) return null
        throw error
    }
}

function formatValue(value: unknown): string {
    if (value === undefined || value === null) return chalk.dim('not set')
    if (typeof value === 'boolean') return value ? 'true' : 'false'
    if (Array.isArray(value)) {
        return value.length === 0 ? chalk.dim('none') : value.join(', ')
    }
    return String(value)
}

function formatConfigView(config: Config, token: TokenPresence | null, showToken: boolean): string {
    const lines: string[] = []
    lines.push(`${chalk.dim('Config file:')} ${CONFIG_PATH}`)
    lines.push('')

    const tokenLine = token
        ? `${showToken ? token.token : maskToken(token.token)} ${chalk.dim(`(${describeTokenSource(token.source)})`)}`
        : formatValue(undefined)

    lines.push(chalk.bold('Authentication'))
    lines.push(`  Token:         ${tokenLine}`)
    lines.push(`  Mode:          ${formatValue(config.auth_mode)}`)
    lines.push(`  Scope:         ${formatValue(config.auth_scope)}`)
    lines.push(`  Flags:         ${formatValue(config.auth_flags)}`)
    lines.push('')

    lines.push(chalk.bold('Updates'))
    lines.push(`  Channel:       ${formatValue(config.update_channel)}`)
    lines.push('')

    lines.push(chalk.bold('Help Center'))
    lines.push(`  Default locale: ${formatValue(config.hc?.defaultLocale)}`)

    return lines.join('\n')
}

export async function viewConfig(options: ViewConfigOptions): Promise<void> {
    const config = await readConfig()

    if (options.json) {
        const output: Config = { ...config }
        if (output.api_token && !options.showToken) {
            output.api_token = maskToken(output.api_token)
        }
        console.log(JSON.stringify(output, null, 2))
        return
    }

    const token = await probeTokenPresence()

    if (Object.keys(config).length === 0 && !token) {
        console.log(`${chalk.dim('Config file:')} ${CONFIG_PATH} ${chalk.dim('(not created yet)')}`)
        return
    }

    console.log(formatConfigView(config, token, options.showToken ?? false))
}
