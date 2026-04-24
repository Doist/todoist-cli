import { Command } from 'commander'
import { listAgents } from '../../lib/skills/index.js'
import { canPromptForSkillInstall, installSkill, promptAndInstallSkill } from './install.js'
import { listSkills } from './list.js'
import { uninstallSkill } from './uninstall.js'
import { updateAllSkills, updateSkill } from './update.js'

export function registerSkillCommand(program: Command): void {
    const skill = program
        .command('skill')
        .description('Manage coding agent skills/integrations')
        .addHelpText(
            'after',
            `
Examples:
  $ td skill install
  $ td skill install codex
  $ td skill update all
`,
        )

    const installCmd = skill
        .command('install [agent]')
        .description('Install skill for a coding agent')
        .option('--local', 'Install in current project instead of global')
        .option('--force', 'Overwrite existing skill file')
        .addHelpText(
            'after',
            `
Supported agents:
  ${listAgents().join(', ')}

Interactive prompt:
  Run without an agent to choose one or more from an interactive checklist.
  Use arrow keys to navigate, Space to toggle, Enter to install, or Ctrl+C to cancel.
  The first viable target is preselected by default.

Examples:
  $ td skill install
  $ td skill install codex
  $ td skill install claude-code --local
`,
        )
        .action((agent, options) => {
            if (!agent) {
                if (!canPromptForSkillInstall()) {
                    installCmd.help()
                    return
                }
                return promptAndInstallSkill(options)
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
