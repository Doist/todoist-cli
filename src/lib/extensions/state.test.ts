import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readState, removeState, stateFilePath, writeState } from './state.js'

describe('extension state', () => {
    let stateDir: string

    beforeEach(async () => {
        stateDir = await mkdtemp(join(tmpdir(), 'td-ext-state-'))
    })

    afterEach(async () => {
        await rm(stateDir, { recursive: true, force: true })
    })

    it('round-trips, creating the directory it needs', async () => {
        await writeState(stateDir, 'td-goals', { pinned: 'v1.2.3', latestRelease: 'v2.0.0' })

        await expect(readState(stateDir, 'td-goals')).resolves.toEqual({
            pinned: 'v1.2.3',
            latestRelease: 'v2.0.0',
        })
    })

    it('reports an empty state when nothing has been written', async () => {
        await expect(readState(stateDir, 'td-unknown')).resolves.toEqual({})
    })

    it('survives a state file that has been edited into nonsense', async () => {
        const path = stateFilePath(stateDir, 'td-goals')
        await writeState(stateDir, 'td-goals', {})
        await writeFile(path, '{ not json')

        // A hand-edited state file must not stop the CLI from running.
        await expect(readState(stateDir, 'td-goals')).resolves.toEqual({})
    })

    it('ignores fields that are not the type the rest of the system expects', async () => {
        await writeState(stateDir, 'td-goals', {})
        await writeFile(
            stateFilePath(stateDir, 'td-goals'),
            JSON.stringify({ pinned: 5, latestRelease: 'v2.0.0' }),
        )

        await expect(readState(stateDir, 'td-goals')).resolves.toEqual({
            latestRelease: 'v2.0.0',
        })
    })

    it('treats a JSON array as no state at all', async () => {
        await writeState(stateDir, 'td-goals', {})
        await writeFile(stateFilePath(stateDir, 'td-goals'), '["pinned"]')

        await expect(readState(stateDir, 'td-goals')).resolves.toEqual({})
    })

    it('writes the file for its owner only', async () => {
        await writeState(stateDir, 'td-goals', { pinned: 'v1' })

        expect((await stat(stateFilePath(stateDir, 'td-goals'))).mode & 0o777).toBe(0o600)
    })

    it('removes a state file, and stays quiet when there is none', async () => {
        await writeState(stateDir, 'td-goals', { pinned: 'v1' })
        await removeState(stateDir, 'td-goals')

        await expect(readState(stateDir, 'td-goals')).resolves.toEqual({})
        await expect(removeState(stateDir, 'td-goals')).resolves.toBeUndefined()
    })

    it('puts state under an extensions directory of its own', () => {
        expect(stateFilePath('/state', 'td-goals')).toBe('/state/extensions/td-goals.json')
        expect(dirname(stateFilePath('/state', 'td-goals'))).toBe('/state/extensions')
    })
})
