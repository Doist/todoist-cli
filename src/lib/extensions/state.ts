/**
 * Per-extension state that is not part of the extension itself: the pin, and
 * the bookkeeping a future update notice will need. It lives outside the
 * extension directory so that deleting the directory by hand is still a clean
 * uninstall, and so a `git pull` can never clobber it.
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export type ExtensionState = {
    /** Git ref or release tag this extension is held at, if pinned. */
    pinned?: string
    checkedForUpdateAt?: string
    latestRelease?: string
}

export function stateFilePath(stateDir: string, dirName: string): string {
    return join(stateDir, 'extensions', `${dirName}.json`)
}

export async function readState(stateDir: string, dirName: string): Promise<ExtensionState> {
    try {
        const raw = await readFile(stateFilePath(stateDir, dirName), 'utf8')
        const parsed: unknown = JSON.parse(raw)
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
        return parsed as ExtensionState
    } catch {
        return {}
    }
}

export async function writeState(
    stateDir: string,
    dirName: string,
    state: ExtensionState,
): Promise<void> {
    const path = stateFilePath(stateDir, dirName)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
}

export async function removeState(stateDir: string, dirName: string): Promise<void> {
    await rm(stateFilePath(stateDir, dirName), { force: true })
}
