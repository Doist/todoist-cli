/**
 * Where the extension system from `@doist/cli-core` meets this CLI.
 *
 * Everything td-specific is decided here — the binary name, the directories,
 * which organisation earns the first-party marker, which colours to use — and
 * handed to the manager. Nothing in cli-core knows any of it.
 */

import { realpathSync } from 'node:fs'
import { getDataDir, getStateDir } from '@doist/cli-core'
import {
    createExtensionManager,
    type ExtensionManager,
    registerExtensionGroup,
} from '@doist/cli-core/extensions'
import chalk from 'chalk'
import type { Command } from 'commander'
import packageJson from '../../../package.json' with { type: 'json' }
import { APP_NAME } from '../../lib/app-name.js'
import { getConfigDir } from '../../lib/config.js'
import { isAccessible } from '../../lib/global-args.js'

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
        dataDir: getDataDir(APP_NAME),
        stateDir: getStateDir(APP_NAME),
        configDir: getConfigDir(),
        hostPath: resolveHostPath(),
        reservedNames: () => reserved,
        officialSource: OFFICIAL_SOURCE,
        officialLabel: 'Todoist',
        // Kept away from the lifecycle scripts npm runs when an extension's
        // dependencies are installed: they are third-party code the user
        // never chose directly.
        secretEnvVars: ['TODOIST_API_TOKEN'],
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

export function registerExtensionCommand(program: Command): void {
    registerExtensionGroup(program, buildExtensionManager(program))
}
