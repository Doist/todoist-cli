/**
 * Removing an extension.
 *
 * The rule is that nothing the user wrote is deleted without them saying so:
 * a local install only loses its link, and a clone with uncommitted work
 * refuses to go until it is forced.
 */

import { rm } from 'node:fs/promises'
import { CliError } from '@doist/cli-core'
import { workingTreeState } from './git.js'
import { removeState } from './state.js'
import type { Extension, RemoveOptions, RemoveResult } from './types.js'

export type RemoveContext = {
    binName: string
    stateDir: string
}

export async function removeExtension(
    extension: Extension,
    options: RemoveOptions,
    context: RemoveContext,
): Promise<RemoveResult> {
    if (extension.kind === 'local') {
        // Only the link inside the extensions directory. The directory it
        // points at belongs to the user.
        await rm(extension.entryPath, { force: true })
        await removeState(context.stateDir, extension.dirName)
        return {
            name: extension.name,
            kind: extension.kind,
            removed: 'link',
            path: extension.entryPath,
        }
    }

    if (extension.kind === 'git' && !options.force) {
        const state = await workingTreeState(extension.dir)
        const forceHint = `Run \`${context.binName} extension remove ${extension.name} --force\` to delete it anyway.`

        if (state === 'dirty') {
            throw new CliError(
                'EXTENSION_DIRTY',
                `"${extension.name}" has uncommitted changes in ${extension.dir}.`,
                { hints: ['Commit or push the changes first, so they are not lost.', forceHint] },
            )
        }
        if (state === 'unknown') {
            throw new CliError(
                'EXTENSION_DIRTY',
                `Could not tell whether "${extension.name}" has uncommitted changes in ${extension.dir}.`,
                {
                    hints: [
                        'git may be missing, or the clone may be damaged or flagged as unsafe to use.',
                        forceHint,
                    ],
                },
            )
        }
    }

    await rm(extension.entryPath, { recursive: true, force: true })
    await removeState(context.stateDir, extension.dirName)

    return {
        name: extension.name,
        kind: extension.kind,
        removed: 'directory',
        path: extension.entryPath,
    }
}
