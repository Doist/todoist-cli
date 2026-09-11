/**
 * Where the host-agnostic extension system meets this CLI.
 *
 * Everything td-specific is decided here — the binary name, the directories,
 * which organisation earns the first-party marker, which colours to use — and
 * handed to the manager. Nothing under `lib/extensions/` knows any of it,
 * which is what lets the whole directory move to `@doist/cli-core` later.
 */

import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import chalk from 'chalk'
import type { Command } from 'commander'
import packageJson from '../../../package.json' with { type: 'json' }
import { getConfigDir } from '../../lib/config.js'
import { registerExtensionGroup } from '../../lib/extensions/commands.js'
import { createExtensionManager, type ExtensionManager } from '../../lib/extensions/manager.js'
import { isAccessible } from '../../lib/global-args.js'
import { getDataDir, getStateDir } from '../../lib/paths.js'

/** The organisation whose extensions show the first-party marker. */
const OFFICIAL_SOURCE = { host: 'github.com', owner: 'Doist' }

/**
 * Names no extension may take, whatever happens to be registered right now.
 *
 * `extension` and `ext` name this group, whose placeholder has already been
 * removed by the time the lazy loader builds the manager. `completion-server`
 * is internal and never registered at all, yet it is what the shell invokes on
 * every tab press, so an extension answering to it would be run constantly
 * with the whole environment inherited.
 */
const ALWAYS_RESERVED = ['extension', 'ext', 'completion-server']

/**
 * The entry script, resolved through whatever symlink npm installed as `td`,
 * so `TD_PATH` names a file an extension can actually run. Falls back to the
 * unresolved path, which is still right for a direct `node dist/index.js`.
 */
function resolveHostPath(): string {
    const entry = process.argv[1] ?? ''
    try {
        return realpathSync(entry)
    } catch {
        return entry
    }
}

export function buildExtensionManager(program: Command): ExtensionManager {
    // Snapshot the names already taken before any extension is registered, so
    // an extension can never be measured as shadowing itself.
    const reserved = new Set([
        ...program.commands.flatMap((command) => [command.name(), ...command.aliases()]),
        ...ALWAYS_RESERVED,
    ])

    return createExtensionManager({
        binName: 'td',
        envPrefix: 'TD',
        version: packageJson.version,
        dataDir: getDataDir(),
        stateDir: getStateDir(),
        configDir: getConfigDir(),
        hostPath: resolveHostPath(),
        reservedNames: () => reserved,
        officialSource: OFFICIAL_SOURCE,
        officialLabel: 'Todoist',
        isAccessible,
        theme: {
            dim: (text) => chalk.dim(text),
            bold: (text) => chalk.bold(text),
            green: (text) => chalk.green(text),
            yellow: (text) => chalk.yellow(text),
        },
        // `log` and `warn` keep their defaults of console.log and
        // console.error. Warnings have to go to stderr so that piping an
        // extension's JSON output somewhere is never polluted by them.
    })
}

/**
 * Where the scaffold templates live, resolved from this module rather than
 * from the working directory.
 *
 * Three levels up lands on the package root from `dist/commands/extension/`
 * and on the repository root from `src/commands/extension/`, so the same path
 * works whether td is running from a build or from source under vitest. The
 * directory ships because `templates` is listed in `files`.
 */
export function templatesDir(): string {
    return fileURLToPath(new URL('../../../templates/extension/', import.meta.url))
}

export function registerExtensionCommand(program: Command): void {
    registerExtensionGroup(program, buildExtensionManager(program), {
        templatesDir: templatesDir(),
    })
}
