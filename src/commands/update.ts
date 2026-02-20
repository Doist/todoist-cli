import { spawn } from 'node:child_process'
import chalk from 'chalk'
import { Command } from 'commander'
import packageJson from '../../package.json' with { type: 'json' }
import { withSpinner } from '../lib/spinner.js'

const PACKAGE_NAME = '@doist/todoist-cli'
const REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`

interface RegistryResponse {
    version: string
}

async function fetchLatestVersion(): Promise<string> {
    const response = await fetch(REGISTRY_URL)
    if (!response.ok) {
        throw new Error(`Registry request failed (HTTP ${response.status})`)
    }
    const data = (await response.json()) as RegistryResponse
    return data.version
}

function detectPackageManager(): string {
    const execPath = process.env.npm_execpath ?? ''
    if (execPath.includes('pnpm')) return 'pnpm'
    return 'npm'
}

function runInstall(pm: string): Promise<number> {
    return new Promise((resolve, reject) => {
        const child = spawn(pm, ['install', '-g', `${PACKAGE_NAME}@latest`], {
            stdio: 'inherit',
        })

        child.on('error', reject)
        child.on('close', (code) => resolve(code ?? 1))
    })
}

export async function updateAction(options: { check?: boolean }): Promise<void> {
    const currentVersion = packageJson.version

    let latestVersion: string
    try {
        latestVersion = await withSpinner(
            { text: 'Checking for updates...', color: 'blue' },
            fetchLatestVersion,
        )
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(chalk.red('Error:'), `Failed to check for updates: ${message}`)
        process.exitCode = 1
        return
    }

    if (currentVersion === latestVersion) {
        console.log(chalk.green('✓'), `Already up to date (v${currentVersion})`)
        return
    }

    console.log(
        `Update available: ${chalk.dim(`v${currentVersion}`)} → ${chalk.green(`v${latestVersion}`)}`,
    )

    if (options.check) {
        return
    }

    const pm = detectPackageManager()
    console.log(chalk.dim(`Updating to v${latestVersion}...`))

    try {
        const exitCode = await runInstall(pm)
        if (exitCode !== 0) {
            console.error(chalk.red('Error:'), `${pm} exited with code ${exitCode}`)
            process.exitCode = 1
            return
        }
    } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'EACCES') {
            console.error(chalk.red('Error:'), 'Permission denied. Try running with sudo:')
            console.error(chalk.dim(`  sudo ${pm} install -g ${PACKAGE_NAME}@latest`))
        } else {
            const message = error instanceof Error ? error.message : String(error)
            console.error(chalk.red('Error:'), `Install failed: ${message}`)
        }
        process.exitCode = 1
        return
    }

    console.log(chalk.green('✓'), `Updated to v${latestVersion}`)
}

export function registerUpdateCommand(program: Command): void {
    program
        .command('update')
        .description('Update the CLI to the latest version')
        .option('--check', 'Check for updates without installing')
        .action(updateAction)
}
