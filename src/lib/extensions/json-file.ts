/**
 * Reading and writing the small JSON files the extension system keeps on disk.
 *
 * One place decides the on-disk shape — two-space indent, trailing newline,
 * owner-only permissions — so the manifest and the state file cannot drift
 * apart, and one place decides what counts as a JSON object.
 */

import { readFile, writeFile } from 'node:fs/promises'

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isMissingFile(error: unknown): boolean {
    return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
}

export type JsonReadResult =
    | { status: 'ok'; value: unknown }
    | { status: 'absent' }
    /** The file is there but could not be read or parsed. */
    | { status: 'unreadable'; reason: string }

/**
 * Read a JSON file, keeping "not there" and "there but broken" apart. Callers
 * that only want the value can use `readJsonValue`; `doctor` needs the
 * distinction, because an unreadable manifest is a problem worth reporting and
 * a missing one is not.
 */
export async function readJsonFile(path: string): Promise<JsonReadResult> {
    let raw: string
    try {
        raw = await readFile(path, 'utf8')
    } catch (error) {
        if (isMissingFile(error)) return { status: 'absent' }
        return { status: 'unreadable', reason: (error as Error).message }
    }

    try {
        return { status: 'ok', value: JSON.parse(raw) }
    } catch {
        return { status: 'unreadable', reason: 'not valid JSON' }
    }
}

/** The parsed value, or undefined when the file is missing or unusable. */
export async function readJsonValue(path: string): Promise<unknown> {
    const result = await readJsonFile(path)
    return result.status === 'ok' ? result.value : undefined
}

export async function writeJsonFile(path: string, value: unknown): Promise<void> {
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
}
