import { CliError } from './errors.js'

const READ_ERROR_CODES = new Set(['EACCES', 'EPERM', 'EISDIR'])

/**
 * Format a Node fs error code into a `CliError` with consistent
 * messaging across the CLI. `kind` is a short capitalized noun phrase
 * ("File", "Template file", "Attachment", ...) that gets folded into
 * the message so callers keep command-specific wording while the
 * code→message translation lives in one place.
 *
 * Returns `undefined` for unrecognized codes so the caller can rethrow.
 */
export function fsCodeToCliError(
    code: string | undefined,
    kind: string,
    filePath?: string,
    detail?: string,
): CliError | undefined {
    const where = filePath ? `: ${filePath}` : ''
    if (code === 'ENOENT') {
        return new CliError('FILE_NOT_FOUND', `${kind} not found${where}`, [
            'Check the file path and try again.',
        ])
    }
    if (code && READ_ERROR_CODES.has(code)) {
        return new CliError(
            'FILE_READ_ERROR',
            `Cannot read ${kind.toLowerCase()}${where}`,
            detail ? [detail] : undefined,
        )
    }
    return undefined
}

/**
 * Walk an error's `cause` chain looking for a Node fs error and
 * translate it via {@link fsCodeToCliError}. Returns `undefined` when
 * the chain doesn't contain a recognized fs error — callers should
 * rethrow the original error in that case.
 */
export function toFileCliError(err: unknown, kind: string): CliError | undefined {
    const fsErr = findFsError(err)
    if (!fsErr) return undefined
    return fsCodeToCliError(fsErr.code, kind, fsErr.path, fsErr.message)
}

function findFsError(error: unknown): NodeJS.ErrnoException | undefined {
    const seen = new Set<unknown>()
    let current: unknown = error
    while (current instanceof Error && !seen.has(current)) {
        seen.add(current)
        if (typeof (current as NodeJS.ErrnoException).code === 'string') {
            return current as NodeJS.ErrnoException
        }
        current = (current as Error & { cause?: unknown }).cause
    }
    return undefined
}
