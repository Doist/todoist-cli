import { openAsBlob } from 'node:fs'
import { stat } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { CliError } from './errors.js'

/**
 * Open a local file as a streaming `Blob` for upload, with CLI-grade
 * error reporting. The returned Blob is file-backed — undici reads it
 * lazily when serializing the multipart request body, so the payload
 * never has to fit in memory all at once.
 *
 * `stat` runs before `openAsBlob` because `openAsBlob` rewraps fs
 * errors as opaque `ERR_INVALID_ARG_VALUE` TypeErrors, which would
 * collapse the `FILE_NOT_FOUND` / `FILE_READ_ERROR` distinction.
 */
export async function openLocalFileAsBlob(
    rawPath: string,
): Promise<{ blob: Blob; filePath: string; fileName: string }> {
    const filePath = resolve(rawPath)
    try {
        await stat(filePath)
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
