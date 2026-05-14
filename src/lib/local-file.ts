import { openAsBlob } from 'node:fs'
import { open } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { CliError } from './errors.js'

/**
 * Open a local file as a streaming `Blob` for upload, with CLI-grade
 * error reporting. The returned Blob is file-backed — undici reads it
 * lazily when serializing the multipart request body, so the payload
 * never has to fit in memory all at once.
 *
 * Why `open` + `close` rather than `stat`: `stat` only proves the path
 * exists; an unreadable file (chmod 000) would slip past and then
 * fail later inside undici, where the error surfaces as a generic
 * transport failure and renders as `INTERNAL_ERROR`. Opening for read
 * and immediately closing verifies actual readability and keeps any
 * fs failure (ENOENT / EACCES / EPERM / EISDIR / …) on the structured
 * `CliError` path. Also disambiguates the opaque
 * `ERR_INVALID_ARG_VALUE` TypeError that `openAsBlob` rewraps fs
 * errors as.
 */
export async function openLocalFileAsBlob(
    rawPath: string,
): Promise<{ blob: Blob; filePath: string; fileName: string }> {
    const filePath = resolve(rawPath)
    try {
        const handle = await open(filePath, 'r')
        await handle.close()
        const blob = await openAsBlob(filePath)
        return { blob, filePath, fileName: basename(filePath) }
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            throw new CliError('FILE_NOT_FOUND', `File not found: ${filePath}`, [
                'Check the file path and try again.',
            ])
        }
        const message = err instanceof Error ? err.message : String(err)
        throw new CliError('FILE_READ_ERROR', `Cannot read file: ${filePath}`, [message])
    }
}
