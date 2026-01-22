import chalk from 'chalk'
import { Command } from 'commander'
import { formatError } from '../lib/output.js'
import { getInstaller, listAgents, skillInstallers } from '../lib/skills/index.js'

interface InstallOptions {
    local?: boolean
    force?: boolean
}

interface UninstallOptions {
    local?: boolean
}

async function installSkill(agent: string, options: InstallOptions): Promise<void> {
    const installer = getInstaller(agent)
    if (!installer) {
        const available = listAgents().join(', ')
        throw new Error(
            formatError('UNKNOWN_AGENT', `Unknown agent: ${agent}`, [
                `Available agents: ${available}`,
            ]),
        )
    }

    const local = options.local ?? false
    const force = options.force ?? false

    await installer.install(local, force)

    const filepath = installer.getInstallPath(local)
    console.log(chalk.green('✓'), `Installed ${installer.name} skill`)
    console.log(chalk.dim(filepath))
}

async function uninstallSkill(agent: string, options: UninstallOptions): Promise<void> {
    const installer = getInstaller(agent)
    if (!installer) {
        const available = listAgents().join(', ')
        throw new Error(
            formatError('UNKNOWN_AGENT', `Unknown agent: ${agent}`, [
                `Available agents: ${available}`,
            ]),
        )
    }

    const local = options.local ?? false

    await installer.uninstall(local)

    console.log(chalk.green('✓'), `Uninstalled ${installer.name} skill`)
}

async function listSkills(): Promise<void> {
    const agents = listAgents()

    console.log(chalk.bold('Available agents:'))
    console.log('')

    for (const agentName of agents) {
        const installer = skillInstallers[agentName]
        const globalInstalled = await installer.isInstalled(false)
        const localInstalled = await installer.isInstalled(true)

        const status: string[] = []
        if (globalInstalled) status.push('global')
        if (localInstalled) status.push('local')

        const statusStr =
            status.length > 0 ? chalk.green(`[${status.join(', ')}]`) : chalk.dim('[not installed]')

        console.log(`  ${agentName}`)
        console.log(`    ${chalk.dim(installer.description)}`)
        console.log(`    ${statusStr}`)
        console.log('')
    }
}

export function registerSkillCommand(program: Command): void {
    const skill = program.command('skill').description('Manage coding agent skills/integrations')

    const installCmd = skill
        .command('install [agent]')
        .description('Install skill for a coding agent')
        .option('--local', 'Install in current project instead of global')
        .option('--force', 'Overwrite existing skill file')
        .action((agent, options) => {
            if (!agent) {
                installCmd.help()
                return
            }
            return installSkill(agent, options)
        })

    const uninstallCmd = skill
        .command('uninstall [agent]')
        .description('Uninstall skill for a coding agent')
        .option('--local', 'Remove from current project instead of global')
        .action((agent, options) => {
            if (!agent) {
                uninstallCmd.help()
                return
            }
            return uninstallSkill(agent, options)
        })

    skill.command('list').description('List supported agents and install status').action(listSkills)
}
