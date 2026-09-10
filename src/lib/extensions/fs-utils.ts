/**
 * The two filesystem questions the extension system asks everywhere: does this
 * path exist, and can it be run.
 */

import { stat } from 'node:fs/promises'

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
 * True when the path is a file the operating system will run. Windows has no
 * executable bit, so there existence is the only signal available.
 */
export async function isExecutable(path: string): Promise<boolean> {
    try {
        const stats = await stat(path)
        if (!stats.isFile()) return false
        return process.platform === 'win32' ? true : (stats.mode & 0o111) !== 0
    } catch {
        return false
    }
}
