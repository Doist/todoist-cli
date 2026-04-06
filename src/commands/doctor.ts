import { readFile } from 'node:fs/promises'
import { TodoistApi } from '@doist/todoist-sdk'
import chalk from 'chalk'
import { Command } from 'commander'
import packageJson from '../../package.json' with { type: 'json' }
import { CONFIG_PATH, NoTokenError, TOKEN_ENV_VAR, probeApiToken } from '../lib/auth.js'
import { validateConfigForDoctor } from '../lib/config.js'
import {
    compareVersions,
    fetchLatestVersion,
    getConfiguredUpdateChannel,
    isNewer,
} from '../lib/update.js'

type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip'

interface DoctorOptions {
    json?: boolean
    offline?: boolean
}

interface DoctorCheck {
    name: string
    status: CheckStatus
    message: string
    details?: Record<string, unknown>
}

interface Summary {
    passed: number
    warned: number
    failed: number
    skipped: number
}

function summarize(checks: DoctorCheck[]): Summary {
    return checks.reduce<Summary>(
        (summary, check) => {
            if (check.status === 'pass') summary.passed += 1
            if (check.status === 'warn') summary.warned += 1
            if (check.status === 'fail') summary.failed += 1
            if (check.status === 'skip') summary.skipped += 1
            return summary
        },
        { passed: 0, warned: 0, failed: 0, skipped: 0 },
    )
}

function buildSummaryLine(summary: Summary): string {
    const parts = [`${summary.passed} passed`]
    if (summary.warned > 0) parts.push(`${summary.warned} warnings`)
    if (summary.failed > 0) parts.push(`${summary.failed} failed`)
    if (summary.skipped > 0) parts.push(`${summary.skipped} skipped`)
    return parts.join(', ')
}

function formatStatus(status: CheckStatus): string {
    switch (status) {
        case 'pass':
            return chalk.green('PASS')
        case 'warn':
            return chalk.yellow('WARN')
        case 'fail':
            return chalk.red('FAIL')
        case 'skip':
            return chalk.gray('SKIP')
    }
}

function isNoTokenError(error: unknown): boolean {
    return (
        error instanceof NoTokenError ||
        (error instanceof Error && error.message.includes('No API token found'))
    )
}

function checkNodeVersion(): DoctorCheck | null {
    const required = packageJson.engines.node
    const match = required.match(/^>=\s*v?(\d+\.\d+\.\d+)$/)

    if (!match) {
        return {
            name: 'node',
            status: 'warn',
            message: `Could not verify Node.js version against unsupported engine range "${required}"`,
            details: { currentVersion: process.version, requiredVersion: required },
        }
    }

    const minimumVersion = match[1]
    const currentVersion = process.version
    const ok = compareVersions(currentVersion, minimumVersion) >= 0

    if (ok) {
        return null
    }

    return {
        name: 'node',
        status: 'fail',
        message: `Node.js ${currentVersion} does not satisfy ${required}`,
        details: { currentVersion, requiredVersion: required },
    }
}

async function checkConfigFile(): Promise<DoctorCheck | null> {
    try {
        const content = await readFile(CONFIG_PATH, 'utf-8')
        const parsed = JSON.parse(content)

        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return {
                name: 'config',
                status: 'fail',
                message: `Config file must contain a JSON object (${CONFIG_PATH})`,
                details: { path: CONFIG_PATH },
            }
        }

        const issues = validateConfigForDoctor(parsed)

        return {
            name: 'config',
            status: issues.length > 0 ? 'warn' : 'pass',
            message:
                issues.length > 0
                    ? `Config file is readable but ${issues.join('; ')} (${CONFIG_PATH})`
                    : `Config file is readable (${CONFIG_PATH})`,
            details: { path: CONFIG_PATH, exists: true, issues },
        }
    } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            return null
        }

        const message = error instanceof Error ? error.message : String(error)
        return {
            name: 'config',
            status: 'fail',
            message: `Could not read config file ${CONFIG_PATH}: ${message}`,
            details: { path: CONFIG_PATH },
        }
    }
}

async function checkAuthentication(offline: boolean): Promise<DoctorCheck> {
    let token: string
    let metadata: Awaited<ReturnType<typeof probeApiToken>>['metadata']

    try {
        const probe = await probeApiToken()
        token = probe.token
        metadata = probe.metadata
    } catch (error) {
        if (isNoTokenError(error)) {
            return {
                name: 'auth',
                status: 'warn',
                message: `No Todoist credentials found. Set ${TOKEN_ENV_VAR} or run td auth login`,
            }
        }

        const message = error instanceof Error ? error.message : String(error)
        return {
            name: 'auth',
            status: 'fail',
            message: `Could not load saved credentials: ${message}`,
        }
    }

    const details: Record<string, unknown> = {
        source: metadata.source,
        authMode: metadata.authMode,
    }
    if (metadata.authScope) details.authScope = metadata.authScope

    if (offline) {
        return {
            name: 'auth',
            status: metadata.source === 'config-file' ? 'warn' : 'skip',
            message:
                metadata.source === 'config-file'
                    ? 'Token found in config-file fallback; skipped API validation (--offline)'
                    : `Auth validation skipped (--offline); credentials found via ${metadata.source}`,
            details,
        }
    }

    try {
        const api = new TodoistApi(token)
        const user = await api.getUser()
        details.email = user.email
        details.fullName = user.fullName

        return {
            name: 'auth',
            status: metadata.source === 'config-file' ? 'warn' : 'pass',
            message:
                metadata.source === 'config-file'
                    ? `Authenticated as ${user.email}, but token is stored in plaintext config fallback`
                    : `Authenticated as ${user.email} via ${metadata.source}`,
            details,
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
            name: 'auth',
            status: 'fail',
            message: `Stored credentials failed validation: ${message}`,
            details,
        }
    }
}

async function checkForUpdates(offline: boolean): Promise<DoctorCheck> {
    const currentVersion = packageJson.version
    const channel = await getConfiguredUpdateChannel()

    if (offline) {
        return {
            name: 'update',
            status: 'skip',
            message: `Skipped npm registry check (--offline); current version is v${currentVersion}`,
            details: { currentVersion, channel },
        }
    }

    try {
        const latestVersion = await fetchLatestVersion(channel)
        if (isNewer(currentVersion, latestVersion)) {
            return {
                name: 'update',
                status: 'warn',
                message: `Update available on ${channel}: v${currentVersion} -> v${latestVersion}`,
                details: { currentVersion, latestVersion, channel },
            }
        }

        if (currentVersion === latestVersion) {
            return {
                name: 'update',
                status: 'pass',
                message: `CLI is up to date on ${channel} (v${currentVersion})`,
                details: { currentVersion, latestVersion, channel },
            }
        }

        return {
            name: 'update',
            status: 'pass',
            message: `CLI version v${currentVersion} is ahead of ${channel} tag v${latestVersion}`,
            details: { currentVersion, latestVersion, channel },
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
            name: 'update',
            status: 'warn',
            message: `Could not check npm registry for updates: ${message}`,
            details: { currentVersion, channel },
        }
    }
}

async function runDoctorChecks(options: DoctorOptions): Promise<DoctorCheck[]> {
    return [
        checkNodeVersion(),
        await checkConfigFile(),
        await checkAuthentication(Boolean(options.offline)),
        await checkForUpdates(Boolean(options.offline)),
    ].filter((check): check is DoctorCheck => check !== null)
}

export async function doctorAction(options: DoctorOptions): Promise<void> {
    const checks = await runDoctorChecks(options)
    const summary = summarize(checks)
    const ok = summary.failed === 0

    if (options.json) {
        console.log(JSON.stringify({ ok, summary, checks }, null, 2))
    } else {
        for (const check of checks) {
            console.log(`${formatStatus(check.status)} ${check.message}`)
        }

        const overallStatus = ok ? chalk.green('Doctor summary:') : chalk.red('Doctor summary:')
        console.log(`${overallStatus} ${buildSummaryLine(summary)}`)
    }

    if (!ok) {
        process.exitCode = 1
    }
}

export function registerDoctorCommand(program: Command): void {
    program
        .command('doctor')
        .description('Diagnose common CLI setup and environment issues')
        .option('--json', 'Output diagnostic results as JSON')
        .option('--offline', 'Skip network checks against Todoist and npm')
        .action(doctorAction)
}
