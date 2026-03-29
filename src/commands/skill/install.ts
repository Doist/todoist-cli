import chalk from 'chalk'
import { formatError } from '../../lib/output.js'
import { getInstaller, listAgents } from '../../lib/skills/index.js'

export interface InstallOptions {
    local?: boolean
    force?: boolean
}

export async function installSkill(agent: string, options: InstallOptions): Promise<void> {
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
