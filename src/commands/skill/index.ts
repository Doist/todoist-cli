import { Command } from 'commander'
import { installSkill } from './install.js'
import { listSkills } from './list.js'
import { uninstallSkill } from './uninstall.js'
import { updateAllSkills, updateSkill } from './update.js'

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

    const updateCmd = skill
        .command('update [agent]')
        .description('Update installed skill to latest version')
        .option('--local', 'Update in current project instead of global')
        .action((agent, options) => {
            if (!agent) {
                updateCmd.help()
                return
            }
            if (agent === 'all') {
                return updateAllSkills(options)
            }
            return updateSkill(agent, options)
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
