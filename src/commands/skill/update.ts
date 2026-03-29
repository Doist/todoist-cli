import chalk from 'chalk'
import { formatError } from '../../lib/output.js'
import { getInstaller, listAgents } from '../../lib/skills/index.js'
import { updateAllInstalledSkills } from '../../lib/skills/update-installed.js'

export interface UpdateOptions {
    local?: boolean
}

export async function updateAllSkills(options: UpdateOptions): Promise<void> {
    const local = options.local ?? false
    const result = await updateAllInstalledSkills(local)

    for (const name of result.updated) {
        console.log(chalk.green('✓'), `Updated ${name} skill`)
    }

    for (const name of result.skipped) {
        console.log(chalk.dim(`  Skipped ${name} (not installed)`))
    }

    for (const name of result.errors) {
        console.log(chalk.red('✗'), `Failed to update ${name}`)
    }

    if (result.updated.length === 0 && result.errors.length === 0) {
        console.log(chalk.dim('No installed skills found to update.'))
    }
}

export async function updateSkill(agent: string, options: UpdateOptions): Promise<void> {
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
    const installed = await installer.isInstalled(local)

    if (!installed) {
        throw new Error(
            `Skill is not installed for ${agent}. Use \`td skill install ${agent}${local ? ' --local' : ''}\` first.`,
        )
    }

    await installer.update(local)

    const filepath = installer.getInstallPath(local)
    console.log(chalk.green('✓'), `Updated ${installer.name} skill`)
    console.log(chalk.dim(filepath))
}
