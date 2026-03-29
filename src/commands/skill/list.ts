import chalk from 'chalk'
import { listAgents, skillInstallers } from '../../lib/skills/index.js'

export async function listSkills(): Promise<void> {
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
