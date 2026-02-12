import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Command } from 'commander'
import { getCompletions } from '../lib/completion.js'

const COMPLETION_EXTENSIONS: Record<string, string> = {
    bash: 'bash',
    zsh: 'zsh',
    fish: 'fish',
    pwsh: 'ps1',
}

/**
 * Find which shells have td completions installed by checking for the
 * completion script files that tabtab creates.
 *
 * FIXME: Workaround for https://github.com/pnpm/tabtab/issues/34 —
 * tabtab.uninstall() without a shell tries all shells and throws ENOENT
 * for ones that were never installed. We detect which shells are actually
 * installed and uninstall only those. Remove once the upstream issue is fixed.
 */
function installedShells(): string[] {
    return Object.entries(COMPLETION_EXTENSIONS)
        .filter(([shell, ext]) =>
            existsSync(join(homedir(), '.config', 'tabtab', shell, `td.${ext}`)),
        )
        .map(([shell]) => shell)
}

export function registerCompletionCommand(program: Command): void {
    const completion = program.command('completion').description('Manage shell completions')

    completion
        .command('install [shell]')
        .description('Install shell completions (bash, zsh, fish)')
        .action(async (shell?: string) => {
            const tabtab = await import('@pnpm/tabtab')

            if (shell && !tabtab.isShellSupported(shell)) {
                console.error(
                    `Unsupported shell: ${shell}. Supported: ${tabtab.SUPPORTED_SHELLS.join(', ')}`,
                )
                process.exitCode = 1
                return
            }

            await tabtab.install({
                name: 'td',
                completer: 'td',
                shell: shell as 'bash' | 'zsh' | 'fish' | undefined,
            })

            console.log('Shell completions installed successfully.')
            console.log('Restart your shell or source your shell config to activate.')
        })

    completion
        .command('uninstall')
        .description('Remove shell completions')
        .action(async () => {
            // FIXME: Replace with plain tabtab.uninstall({ name: 'td' }) once
            // https://github.com/pnpm/tabtab/issues/34 is fixed.
            const shells = installedShells()
            if (shells.length === 0) {
                console.log('No shell completions installed.')
                return
            }

            const tabtab = await import('@pnpm/tabtab')
            for (const shell of shells) {
                await tabtab.uninstall({
                    name: 'td',
                    shell: shell as 'bash' | 'zsh' | 'fish' | 'pwsh',
                })
            }
            console.log('Shell completions removed.')
        })

    // Hidden command invoked by the shell completion script at TAB time
    const server = program
        .command('completion-server')
        .description('Completion server (internal)')
        .allowUnknownOption()
        .allowExcessArguments()
        .action(async () => {
            const tabtab = await import('@pnpm/tabtab')
            const env = tabtab.parseEnv(process.env)

            if (!env.complete) {
                return
            }

            const shell = tabtab.getShellFromEnv(process.env)

            // Parse the line into words, removing the binary name (td)
            const words = env.line.split(/\s+/).slice(1)

            // Remove the 'completion-server' part if present (tabtab inserts it)
            if (words[0] === 'completion-server') {
                words.shift()
            }

            const completions = getCompletions(program, words, env.last)
            tabtab.log(completions, shell)
        })
    ;(server as Command & { _hidden: boolean })._hidden = true
}
