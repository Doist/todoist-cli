import { realpathSync } from 'node:fs'
import chalk from 'chalk'

/**
 * The CLI is now published as `@todoist/cli`. This package (`@doist/todoist-cli`)
 * gets no further releases, so `td update` checking its own name would report
 * "up to date" forever. Instead it points people at the new package and moves
 * npm and pnpm installs over to it.
 */
export const NEW_PACKAGE_NAME = '@todoist/cli'

export type PackageManager = 'npm' | 'pnpm'

/**
 * True when td was installed by Homebrew. Same signal as the update command in
 * `@doist/cli-core`, which does not export it: brew's bin shims resolve into a
 * Cellar on every platform, and brew never runs on Windows.
 */
export function isHomebrewInstall(): boolean {
    if (process.platform === 'win32') return false
    const script = process.argv[1]
    if (!script) return false
    let resolved = script
    try {
        resolved = realpathSync(script)
    } catch {
        // Unresolvable path: fall back to the literal argv entry.
    }
    return resolved.includes('/Cellar/')
}

/**
 * The package manager that installed td. Same signal as the update command in
 * `@doist/cli-core`: a global pnpm install has `pnpm` somewhere in the running
 * script's path, the node binary's path or `npm_execpath`.
 */
export function detectPackageManager(): PackageManager {
    const haystack = [process.env.npm_execpath, process.argv[1], process.execPath]
        .filter(Boolean)
        .join(' ')
    return haystack.includes('pnpm') ? 'pnpm' : 'npm'
}

/**
 * Tell people still on `@doist/todoist-cli` that the CLI has moved. Written to
 * stderr and only when stderr is a terminal, so JSON, NDJSON, piped output and
 * agents never see it. Homebrew installs are left alone: the formula moves
 * them, and `td update` does not. `update` explains the move itself, and
 * `completion-server` output goes to the shell, so neither prints it.
 */
export function printMovedNotice(command: string | undefined): void {
    if (command === 'update' || command === 'completion-server') return
    if (!process.stderr.isTTY || isHomebrewInstall()) return
    process.stderr.write(
        `${chalk.yellow(`td has moved to ${NEW_PACKAGE_NAME}. Run "td update" to switch.`)}\n`,
    )
}
