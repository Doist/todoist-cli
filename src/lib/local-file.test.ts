import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, relative } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openLocalFileAsBlob } from './local-file.js'

describe('openLocalFileAsBlob', () => {
    let tmpDir: string
    let filePath: string

    beforeAll(async () => {
        tmpDir = await mkdtemp(join(tmpdir(), 'td-local-file-test-'))
        filePath = join(tmpDir, 'sample.bin')
        await writeFile(filePath, 'hello local-file helper')
    })

    afterAll(async () => {
        await rm(tmpDir, { recursive: true, force: true })
    })

    it('returns a file-backed Blob plus the resolved absolute path and basename', async () => {
        const result = await openLocalFileAsBlob(filePath)

        expect(result.filePath).toBe(filePath)
        expect(result.fileName).toBe('sample.bin')
        expect(result.blob).toBeInstanceOf(Blob)
        // Blob is file-backed — reading it yields the actual file bytes.
        expect(await result.blob.text()).toBe('hello local-file helper')
    })

    it('resolves relative paths against the current working directory', async () => {
        const rel = relative(process.cwd(), filePath)
        const result = await openLocalFileAsBlob(rel)

        // The returned filePath is the absolute form.
        expect(result.filePath).toBe(filePath)
        expect(result.fileName).toBe('sample.bin')
        expect(await result.blob.text()).toBe('hello local-file helper')
    })

    it('throws FILE_NOT_FOUND with the standard hint when the file is missing', async () => {
        const missing = join(tmpDir, 'does-not-exist.bin')

        await expect(openLocalFileAsBlob(missing)).rejects.toMatchObject({
            code: 'FILE_NOT_FOUND',
            message: `File not found: ${missing}`,
            hints: ['Check the file path and try again.'],
        })
    })

    it('throws FILE_READ_ERROR for non-ENOENT failures, preserving the underlying message as a hint', async () => {
        // Embedded null byte → `stat` rejects with ERR_INVALID_ARG_VALUE
        // (not ENOENT), routing to FILE_READ_ERROR. Portable across
        // platforms because Node forbids null bytes in paths everywhere.
        const badPath = join(tmpDir, `bad-${String.fromCharCode(0)}-name.bin`)

        await expect(openLocalFileAsBlob(badPath)).rejects.toMatchObject({
            code: 'FILE_READ_ERROR',
            message: expect.stringContaining('Cannot read file:'),
            hints: [expect.stringContaining('null bytes')],
        })
    })

    it('uses basename of the resolved path even when given an unusual input', async () => {
        // Sanity check that `basename` runs against the resolved
        // absolute path, not the raw input — a relative path with `./`
        // segments shouldn't change the resulting fileName.
        const messy = `./${basename(tmpDir)}/./sample.bin`
        const result = await openLocalFileAsBlob(join(tmpDir, '..', messy))
        expect(result.fileName).toBe('sample.bin')
    })
})
