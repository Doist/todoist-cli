/**
 * Registering the installed extensions as commands, and running one.
 *
 * Split from the command group because the two sit on different paths: the
 * group is loaded only when someone types `td extension …`, while this runs
 * whenever the command token is not a built-in, which is what `--help`,
 * completion and the unknown-command message all need.
 */

import type { Command } from 'commander'
import { USER_ENV_VAR } from '../../lib/auth-store.js'
import type { ExtensionCommands } from '../../lib/extensions/commands.js'
import { registerExtensionPassThrough } from '../../lib/extensions/commands.js'
import type { DispatchOptions } from '../../lib/extensions/types.js'
import {
    getRequestedUserRef,
    getVerboseLevel,
    setHostArgvLength,
    shouldDisableSpinner,
} from '../../lib/global-args.js'
import { buildExtensionManager } from './index.js'

/**
 * What td adds to a dispatch, whichever way the extension was reached.
 *
 * `hostArgvLength` is where td's own arguments stop. Everything after the
 * extension's name belongs to the extension, so the global-args parser is
 * told to stop there before anything is read from it: `td goals --json` is
 * `--json` for `goals`, and must not put td into JSON mode or change which
 * account is passed on.
 */
export function hostDispatchOptions(hostArgvLength: number): DispatchOptions {
    setHostArgvLength(hostArgvLength)

    const verbose = getVerboseLevel()
    return {
        user: getRequestedUserRef() ?? (process.env[USER_ENV_VAR] || undefined),
        // The manager sets TD_ACCESSIBLE itself; these two are td's own flags,
        // translated into the variables td reads when the extension calls back
        // into it.
        env: {
            TD_VERBOSE: verbose > 0 ? String(verbose) : undefined,
            TD_SPINNER: shouldDisableSpinner() ? 'false' : undefined,
        },
    }
}

export async function setUpExtensionDispatch(program: Command): Promise<ExtensionCommands> {
    const manager = buildExtensionManager(program)

    return registerExtensionPassThrough(program, manager, {
        // One definition of what running an extension means, used whether the
        // entry point dispatches before commander parses or commander reaches
        // the registered command.
        dispatch: (name, args, hostArgvLength) =>
            manager.dispatch(name, args, hostDispatchOptions(hostArgvLength)),
    })
}
