/**
 * Registering the installed extensions as commands.
 *
 * Split from the command group because the two sit on different paths: the
 * group is loaded only when someone types `td extension …`, while this runs
 * whenever the command token is not a built-in, which is what `--help`,
 * completion and the unknown-command message all need.
 */

import type { Command } from 'commander'
import type { ExtensionCommands } from '../../lib/extensions/commands.js'
import { registerExtensionPassThrough } from '../../lib/extensions/commands.js'
import { buildExtensionManager } from './index.js'

export async function setUpExtensionDispatch(program: Command): Promise<ExtensionCommands> {
    return registerExtensionPassThrough(program, buildExtensionManager(program))
}
