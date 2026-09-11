/**
 * The two filesystem questions the extension system asks everywhere: does this
 * path exist, and can it be run.
 */

import { constants } from 'node:fs'
import { access, stat } from 'node:fs/promises'

export async function exists(path: string): Promise<boolean> {
    try {
        await stat(path)
        return true
    } catch {
        return false
    }
}

export async function isDirectory(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isDirectory()
    } catch {
        return false
    }
}

/**
 * True when the path is a file this process can actually run.
 *
 * `access` is asked rather than the mode bits, because permission can come
 * from an access-control list the mode does not describe, and on Windows it
 * reduces to an existence check, which is the only signal available there.
 */
export async function isExecutable(path: string): Promise<boolean> {
    try {
        if (!(await stat(path)).isFile()) return false
        await access(path, constants.X_OK)
        return true
    } catch {
        return false
    }
}
