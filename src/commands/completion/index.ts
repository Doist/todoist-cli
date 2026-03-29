import { Command } from 'commander'
import { installAction } from './install.js'
import { serverAction } from './server.js'
import { uninstallAction } from './uninstall.js'

export function registerCompletionCommand(program: Command): void {
    const completion = program.command('completion').description('Manage shell completions')

    completion
        .command('install [shell]')
        .description('Install shell completions (bash, zsh, fish)')
        .action(async (shell?: string) => {
            await installAction(shell)
        })

    completion
        .command('uninstall')
        .description('Remove shell completions')
        .action(async () => {
            await uninstallAction()
        })

    // Hidden command invoked by the shell completion script at TAB time
    program
        .command('completion-server', { hidden: true })
        .description('Completion server (internal)')
        .allowUnknownOption()
        .allowExcessArguments()
        .action(async () => {
            await serverAction(program)
        })
}
