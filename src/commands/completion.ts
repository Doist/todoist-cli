import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Command } from 'commander'
import { getCompletions, parseCompLine } from '../lib/completion.js'

// pwsh is included because tabtab supports it — installedShells() needs to
// detect and clean up pwsh completion files even though we don't advertise it.
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

            const words = parseCompLine(env.line)

            let current = env.last

            // The fish/zsh completion templates always append a trailing space
            // to COMP_LINE, making env.last empty even when the cursor is right
            // after '--flag='. Use env.lastPartial (cursor-position-aware) to
            // detect this case and restore the actual word being completed.
            if (current === '' && env.lastPartial.includes('=')) {
                words.pop()
                current = env.lastPartial
            }

            const completions = getCompletions(program, words, current)

            // Bash treats '=' as a word break (COMP_WORDBREAKS), so readline
            // replaces only the part after '=' with COMPREPLY values. If we
            // return '--flag=value', bash produces '--flag=--flag=value'.
            // Strip the flag prefix so bash gets just the value part.
            if (shell === 'bash' && current.includes('=')) {
                const prefix = current.slice(0, current.indexOf('=') + 1)
                const values = completions
                    .map((c) => (c.name.startsWith(prefix) ? c.name.slice(prefix.length) : c.name))
                    .filter(Boolean)
                console.log(values.join('\n'))
                return
            }

            tabtab.log(completions, shell)
        })
    ;(server as Command & { _hidden: boolean })._hidden = true
}
