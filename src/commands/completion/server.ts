import type { Command } from 'commander'
import { getCompletions, parseCompLine } from '../../lib/completion.js'

export async function serverAction(program: Command): Promise<void> {
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
        if (words.at(-1) === '') words.pop()
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
}
