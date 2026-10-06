import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./update-installed.js', () => ({
    updateAllInstalledSkills: vi.fn(),
}))

import { refreshSkillsAfterUpgrade } from './refresh-on-upgrade.js'
import { updateAllInstalledSkills } from './update-installed.js'

const mockUpdateAll = vi.mocked(updateAllInstalledSkills)

describe('refreshSkillsAfterUpgrade', () => {
    let stateHome: string
    let stampPath: string

    beforeEach(async () => {
        stateHome = await mkdtemp(join(tmpdir(), 'td-skills-'))
        vi.stubEnv('XDG_STATE_HOME', stateHome)
        stampPath = join(stateHome, 'todoist-cli', 'skills-version')
        mockUpdateAll.mockReset()
        mockUpdateAll.mockResolvedValue({ updated: ['claude-code'], skipped: [], errors: [] })
    })

    afterEach(async () => {
        vi.unstubAllEnvs()
        await rm(stateHome, { recursive: true, force: true })
    })

    async function stamp(version: string): Promise<void> {
        await refreshSkillsAfterUpgrade(version)
    }

    it('refreshes and stamps when no stamp exists', async () => {
        await refreshSkillsAfterUpgrade('5.5.0')

        expect(mockUpdateAll).toHaveBeenCalledWith(false)
        expect((await readFile(stampPath, 'utf8')).trim()).toBe('5.5.0')
    })

    it('refreshes after an upgrade', async () => {
        await stamp('5.4.5')
        mockUpdateAll.mockClear()

        await refreshSkillsAfterUpgrade('5.5.0')

        expect(mockUpdateAll).toHaveBeenCalledTimes(1)
        expect((await readFile(stampPath, 'utf8')).trim()).toBe('5.5.0')
    })

    it('does nothing when the version is unchanged', async () => {
        await stamp('5.5.0')
        mockUpdateAll.mockClear()

        await refreshSkillsAfterUpgrade('5.5.0')

        expect(mockUpdateAll).not.toHaveBeenCalled()
    })

    it('leaves skills alone when an older version runs', async () => {
        await stamp('5.5.0')
        mockUpdateAll.mockClear()

        await refreshSkillsAfterUpgrade('5.4.5')

        expect(mockUpdateAll).not.toHaveBeenCalled()
        expect((await readFile(stampPath, 'utf8')).trim()).toBe('5.5.0')
    })

    it('does not stamp when a skill failed to update, so the next run retries', async () => {
        mockUpdateAll.mockResolvedValue({ updated: [], skipped: [], errors: ['codex'] })

        await refreshSkillsAfterUpgrade('5.5.0')

        expect(mockUpdateAll).toHaveBeenCalledWith(false)
        await expect(readFile(stampPath, 'utf8')).rejects.toThrow()

        await refreshSkillsAfterUpgrade('5.5.0')
        expect(mockUpdateAll).toHaveBeenCalledTimes(2)
    })

    it('leaves skills alone when the stamp exists but cannot be read', async () => {
        // A directory where the stamp file should be makes the read fail with EISDIR.
        await mkdir(stampPath, { recursive: true })

        await expect(refreshSkillsAfterUpgrade('5.5.0')).rejects.toMatchObject({
            code: 'EISDIR',
        })
        expect(mockUpdateAll).not.toHaveBeenCalled()
    })
})
