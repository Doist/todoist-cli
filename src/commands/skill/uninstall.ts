import chalk from 'chalk'
import { formatError } from '../../lib/output.js'
import { getInstaller, listAgents } from '../../lib/skills/index.js'

export interface UninstallOptions {
    local?: boolean
}

export async function uninstallSkill(agent: string, options: UninstallOptions): Promise<void> {
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
