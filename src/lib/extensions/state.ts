/**
 * Per-extension state that is not part of the extension itself: the pin, and
 * the bookkeeping a future update notice will need. It lives outside the
 * extension directory so that deleting the directory by hand is still a clean
 * uninstall, and so a `git pull` can never clobber it.
 */

import { mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { readJsonValue, writeJsonFile } from './json-file.js'
import type { ExtensionState } from './schemas.js'

export type { ExtensionState }

export function stateFilePath(stateDir: string, dirName: string): string {
    return join(stateDir, 'extensions', `${dirName}.json`)
}

/**
 * The recorded state, or an empty one. The file is in the user's state
 * directory and can be edited by hand, so each field is taken only when it is
 * the type the rest of the system expects; anything else is treated as absent
 * rather than being handed on as a string that is not a string.
 */
export async function readState(stateDir: string, dirName: string): Promise<ExtensionState> {
    const value = await readJsonValue(stateFilePath(stateDir, dirName))
    // No file, nothing to validate, and no reason to load a validator.
    if (value === undefined) return {}
    return (await import('./schemas.js')).parseExtensionState(value)
}

export async function writeState(
    stateDir: string,
    dirName: string,
    state: ExtensionState,
): Promise<void> {
    const path = stateFilePath(stateDir, dirName)
    await mkdir(dirname(path), { recursive: true })
    await writeJsonFile(path, state)
}

export async function removeState(stateDir: string, dirName: string): Promise<void> {
    await rm(stateFilePath(stateDir, dirName), { force: true })
}
