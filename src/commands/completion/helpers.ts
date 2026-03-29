import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { SupportedShell } from '@pnpm/tabtab'

// pwsh is included because tabtab supports it — installedShells() needs to
// detect and clean up pwsh completion files even though we don't advertise it.
export const COMPLETION_EXTENSIONS: Record<SupportedShell, string> = {
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
export function installedShells(): SupportedShell[] {
    return Object.entries(COMPLETION_EXTENSIONS)
        .filter(([shell, ext]) =>
            existsSync(join(homedir(), '.config', 'tabtab', shell, `td.${ext}`)),
        )
        .map(([shell]) => shell as SupportedShell)
}
