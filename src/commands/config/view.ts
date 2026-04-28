import chalk from 'chalk'
import {
    type AuthMetadata,
    listStoredUsers,
    NoTokenError,
    probeApiToken,
    type StoredUser,
    TOKEN_ENV_VAR,
} from '../../lib/auth.js'
import { type Config, CONFIG_PATH, readConfigStrict } from '../../lib/config.js'
import { SECURE_STORE_DESCRIPTION, SecureStoreUnavailableError } from '../../lib/secure-store.js'
import { getDefaultUserId, NoUserSelectedError } from '../../lib/users.js'

export interface ViewConfigOptions {
    json?: boolean
    showToken?: boolean
}

type TokenStatus =
    | { state: 'present'; token: string; metadata: AuthMetadata }
    | { state: 'missing' }
    | { state: 'ambiguous' }
    | { state: 'unavailable'; reason: string }

function maskToken(token: string): string {
    if (token.length < 5) return '****'
    return `****…${token.slice(-4)}`
}

function describeTokenSource(source: AuthMetadata['source']): string {
    switch (source) {
        case 'env':
            return `environment variable ${TOKEN_ENV_VAR}`
        case 'secure-store':
            return SECURE_STORE_DESCRIPTION
        case 'config-file':
            return 'config file (plaintext fallback)'
    }
}

async function probeTokenPresence(): Promise<TokenStatus> {
    try {
        const { token, metadata } = await probeApiToken()
        return { state: 'present', token, metadata }
    } catch (error) {
        if (error instanceof NoTokenError) return { state: 'missing' }
        if (error instanceof NoUserSelectedError) return { state: 'ambiguous' }
        if (error instanceof SecureStoreUnavailableError) {
            return {
                state: 'unavailable',
                reason: `${SECURE_STORE_DESCRIPTION} unavailable (${error.message})`,
            }
        }
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

function renderTokenLine(token: TokenStatus, showToken: boolean): string {
    switch (token.state) {
        case 'present': {
            const value = showToken ? token.token : maskToken(token.token)
            return `${value} ${chalk.dim(`(${describeTokenSource(token.metadata.source)})`)}`
        }
        case 'unavailable':
            return chalk.dim(`unknown — ${token.reason}`)
        case 'ambiguous':
            return chalk.dim(
                'multiple stored accounts; pass --user <id|email> or set a default with `td user use`',
            )
        case 'missing':
            return formatValue(undefined)
    }
}

function formatStoredUserMode(user: StoredUser): string {
    if (user.auth_mode === 'read-only') {
        return `read-only (${user.auth_scope ?? 'data:read'})`
    }
    if (user.auth_mode === 'read-write') {
        return 'read-write'
    }
    return chalk.dim('unknown')
}

function formatConfigView(
    config: Config,
    token: TokenStatus,
    showToken: boolean,
    users: StoredUser[],
    defaultUserId: string | undefined,
): string {
    const lines: string[] = []
    lines.push(`${chalk.dim('Config file:')} ${CONFIG_PATH}`)
    lines.push('')

    // Active-user line: who would the next command run as?
    lines.push(chalk.bold('Authentication'))
    if (token.state === 'present' && token.metadata.email) {
        const isDefault = token.metadata.userId === defaultUserId
        const marker =
            token.metadata.source === 'env' ? ' (TODOIST_API_TOKEN)' : isDefault ? ' (default)' : ''
        lines.push(
            `  Active:        ${token.metadata.email} ${chalk.dim(`(id:${token.metadata.userId ?? '—'})`)}${marker}`,
        )
    } else if (token.state === 'present' && token.metadata.source === 'env') {
        lines.push(`  Active:        ${chalk.dim('(TODOIST_API_TOKEN)')}`)
    } else if (token.state === 'ambiguous') {
        lines.push(`  Active:        ${chalk.dim('(none — multiple accounts, no default)')}`)
    } else if (token.state === 'missing') {
        lines.push(`  Active:        ${chalk.dim('(none)')}`)
    }
    // When a token is present, its metadata is the ground truth for the active
    // mode/scope/flags — this matters most for env-sourced tokens, whose scope
    // the CLI does not actually know. For missing/unavailable tokens, fall
    // back to the config file values (what the CLI would attempt once auth
    // recovers — only relevant for legacy v1 state).
    const effectiveMode = token.state === 'present' ? token.metadata.authMode : config.auth_mode
    const effectiveScope = token.state === 'present' ? token.metadata.authScope : config.auth_scope
    const effectiveFlags = token.state === 'present' ? token.metadata.authFlags : config.auth_flags

    lines.push(`  Token:         ${renderTokenLine(token, showToken)}`)
    lines.push(`  Mode:          ${formatValue(effectiveMode)}`)
    lines.push(`  Scope:         ${formatValue(effectiveScope)}`)
    lines.push(`  Flags:         ${formatValue(effectiveFlags)}`)
    lines.push('')

    if (users.length > 0) {
        lines.push(chalk.bold(`Stored accounts (${users.length})`))
        for (const u of users) {
            const isDefault = u.id === defaultUserId
            const marker = isDefault ? chalk.green(' (default)') : ''
            const storage = u.api_token
                ? chalk.yellow('plaintext fallback')
                : chalk.dim(SECURE_STORE_DESCRIPTION)
            lines.push(`  ${u.email} ${chalk.dim(`(id:${u.id})`)}${marker}`)
            lines.push(`    Mode:    ${formatStoredUserMode(u)}`)
            if (u.auth_flags && u.auth_flags.length > 0) {
                lines.push(`    Flags:   ${u.auth_flags.join(', ')}`)
            }
            lines.push(`    Storage: ${storage}`)
        }
        lines.push('')
    }

    lines.push(chalk.bold('Updates'))
    lines.push(`  Channel:       ${formatValue(config.update_channel)}`)
    lines.push('')

    lines.push(chalk.bold('Help Center'))
    lines.push(`  Default locale: ${formatValue(config.hc?.defaultLocale)}`)
    lines.push('')

    lines.push(chalk.bold('Workspace'))
    lines.push(
        `  Default workspace: ${
            config.workspace?.defaultWorkspace
                ? `id:${config.workspace.defaultWorkspace}`
                : formatValue(undefined)
        }`,
    )

    return lines.join('\n')
}

function maskConfigForJson(config: Config, showToken: boolean): Config {
    if (showToken) return config
    const masked: Config = { ...config }
    if (typeof masked.api_token === 'string') {
        masked.api_token = maskToken(masked.api_token)
    }
    if (Array.isArray(masked.users)) {
        masked.users = masked.users.map((u) =>
            typeof u.api_token === 'string' ? { ...u, api_token: maskToken(u.api_token) } : u,
        )
    }
    return masked
}

export async function viewConfig(options: ViewConfigOptions): Promise<void> {
    const read = await readConfigStrict()
    const config: Config = read.state === 'present' ? read.config : {}

    if (options.json) {
        console.log(JSON.stringify(maskConfigForJson(config, options.showToken ?? false), null, 2))
        return
    }

    const token = await probeTokenPresence()
    const users = await listStoredUsers()
    const defaultUserId = getDefaultUserId(config)

    if (read.state === 'missing' && token.state === 'missing' && users.length === 0) {
        console.log(`${chalk.dim('Config file:')} ${CONFIG_PATH} ${chalk.dim('(not created yet)')}`)
        return
    }

    console.log(formatConfigView(config, token, options.showToken ?? false, users, defaultUserId))
}
