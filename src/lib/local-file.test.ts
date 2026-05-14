import { chmodSync, openAsBlob } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, relative } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { openLocalFileAsBlob } from './local-file.js'

// Partial mock of `node:fs` so the `openAsBlob`-rejects branch can be
// exercised. Default implementation delegates to the real module so
// every other test in this file keeps using real fs.
vi.mock('node:fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:fs')>()
    return {
        ...actual,
        openAsBlob: vi.fn().mockImplementation(actual.openAsBlob),
    }
})

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
        // Embedded null byte → the open() call rejects with
        // ERR_INVALID_ARG_VALUE (not ENOENT), routing to
        // FILE_READ_ERROR. Portable across platforms because Node
        // forbids null bytes in paths everywhere.
        const badPath = join(tmpDir, `bad-${String.fromCharCode(0)}-name.bin`)

        await expect(openLocalFileAsBlob(badPath)).rejects.toMatchObject({
            code: 'FILE_READ_ERROR',
            message: expect.stringContaining('Cannot read file:'),
            hints: [expect.stringContaining('null bytes')],
        })
    })

    it('maps a post-preflight openAsBlob failure to FILE_READ_ERROR', async () => {
        // The `open(path, 'r')` preflight catches most fs errors before
        // `openAsBlob` runs, but a race (file deleted between the two
        // calls) or a future Node behavior change could surface a
        // failure here. Mock to force it.
        vi.mocked(openAsBlob).mockRejectedValueOnce(
            Object.assign(new TypeError('Unable to open file as blob'), {
                code: 'ERR_INVALID_ARG_VALUE',
            }),
        )

        await expect(openLocalFileAsBlob(filePath)).rejects.toMatchObject({
            code: 'FILE_READ_ERROR',
            message: `Cannot read file: ${filePath}`,
            hints: [expect.stringContaining('Unable to open file as blob')],
        })
    })

    it('maps a post-preflight openAsBlob ENOENT (race) to FILE_NOT_FOUND', async () => {
        vi.mocked(openAsBlob).mockRejectedValueOnce(
            Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
        )

        await expect(openLocalFileAsBlob(filePath)).rejects.toMatchObject({
            code: 'FILE_NOT_FOUND',
            message: `File not found: ${filePath}`,
            hints: ['Check the file path and try again.'],
        })
    })

    // Skip on Windows: the POSIX permission model and `chmod 000`
    // semantics don't translate. The branch is still exercised on
    // Linux/macOS CI.
    it.skipIf(process.platform === 'win32')(
        'throws FILE_READ_ERROR when the file exists but is unreadable',
        async () => {
            const unreadable = join(tmpDir, 'no-perms.bin')
            await writeFile(unreadable, 'secret')
            chmodSync(unreadable, 0o000)
            try {
                await expect(openLocalFileAsBlob(unreadable)).rejects.toMatchObject({
                    code: 'FILE_READ_ERROR',
                    message: `Cannot read file: ${unreadable}`,
                    hints: [expect.stringContaining('EACCES')],
                })
            } finally {
                // Restore so `rm` in afterAll can delete it.
                chmodSync(unreadable, 0o600)
            }
        },
    )

    it('uses basename of the resolved path even when given an unusual input', async () => {
        // Sanity check that `basename` runs against the resolved
        // absolute path, not the raw input — a relative path with `./`
        // segments shouldn't change the resulting fileName.
        const messy = `./${basename(tmpDir)}/./sample.bin`
        const result = await openLocalFileAsBlob(join(tmpDir, '..', messy))
        expect(result.fileName).toBe('sample.bin')
    })
})
