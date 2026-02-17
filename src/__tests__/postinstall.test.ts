import { describe, expect, it, vi } from 'vitest'
import type { SkillInstaller } from '../lib/skills/types.js'

vi.mock('../lib/skills/index.js', () => ({
    skillInstallers: {} as Record<string, SkillInstaller>,
}))

import { skillInstallers } from '../lib/skills/index.js'
import { updateAllInstalledSkills } from '../lib/skills/update-installed.js'

function mockInstaller(overrides: Partial<SkillInstaller> = {}): SkillInstaller {
    return {
        name: 'test',
        description: 'test',
        getInstallPath: vi.fn(() => '/test/path'),
        generateContent: vi.fn(() => 'content'),
        isInstalled: vi.fn(async () => false),
        install: vi.fn(async () => {}),
        update: vi.fn(async () => {}),
        uninstall: vi.fn(async () => {}),
        ...overrides,
    }
}

function setInstaller(name: string, installer: SkillInstaller) {
    ;(skillInstallers as Record<string, SkillInstaller>)[name] = installer
}

function removeInstaller(name: string) {
    const installers = skillInstallers as Record<string, SkillInstaller>
    delete installers[name]
}

function getInstaller(name: string): SkillInstaller {
    return (skillInstallers as Record<string, SkillInstaller>)[name]
}

function clearInstallers() {
    const installers = skillInstallers as Record<string, SkillInstaller>
    for (const key of Object.keys(installers)) {
        delete installers[key]
    }
}

describe('updateAllInstalledSkills', () => {
    it('updates all installed skills', async () => {
        setInstaller(
            'agent-a',
            mockInstaller({
                name: 'agent-a',
                isInstalled: vi.fn(async () => true),
            }),
        )
        setInstaller(
            'agent-b',
            mockInstaller({
                name: 'agent-b',
                isInstalled: vi.fn(async () => true),
            }),
        )

        const result = await updateAllInstalledSkills(false)

        expect(result.updated).toEqual(['agent-a', 'agent-b'])
        expect(result.skipped).toEqual([])
        expect(result.errors).toEqual([])
        expect(getInstaller('agent-a').update).toHaveBeenCalledWith(false)
        expect(getInstaller('agent-b').update).toHaveBeenCalledWith(false)

        removeInstaller('agent-a')
        removeInstaller('agent-b')
    })

    it('skips agents that are not installed', async () => {
        setInstaller(
            'agent-installed',
            mockInstaller({
                name: 'agent-installed',
                isInstalled: vi.fn(async () => true),
            }),
        )
        setInstaller(
            'agent-missing',
            mockInstaller({
                name: 'agent-missing',
                isInstalled: vi.fn(async () => false),
            }),
        )

        const result = await updateAllInstalledSkills(false)

        expect(result.updated).toEqual(['agent-installed'])
        expect(result.skipped).toEqual(['agent-missing'])
        expect(result.errors).toEqual([])
        expect(getInstaller('agent-installed').update).toHaveBeenCalledWith(false)
        expect(getInstaller('agent-missing').update).not.toHaveBeenCalled()

        removeInstaller('agent-installed')
        removeInstaller('agent-missing')
    })

    it('continues updating remaining agents if one fails', async () => {
        setInstaller(
            'agent-failing',
            mockInstaller({
                name: 'agent-failing',
                isInstalled: vi.fn(async () => true),
                update: vi.fn(async () => {
                    throw new Error('update failed')
                }),
            }),
        )
        setInstaller(
            'agent-working',
            mockInstaller({
                name: 'agent-working',
                isInstalled: vi.fn(async () => true),
            }),
        )

        const result = await updateAllInstalledSkills(false)

        expect(result.errors).toEqual(['agent-failing'])
        expect(result.updated).toEqual(['agent-working'])
        expect(getInstaller('agent-working').update).toHaveBeenCalledWith(false)

        removeInstaller('agent-failing')
        removeInstaller('agent-working')
    })

    it('never throws even when all operations fail', async () => {
        setInstaller(
            'fail-1',
            mockInstaller({
                name: 'fail-1',
                isInstalled: vi.fn(async () => {
                    throw new Error('check failed')
                }),
            }),
        )
        setInstaller(
            'fail-2',
            mockInstaller({
                name: 'fail-2',
                isInstalled: vi.fn(async () => true),
                update: vi.fn(async () => {
                    throw new Error('update failed')
                }),
            }),
        )

        const result = await updateAllInstalledSkills(false)

        expect(result.errors).toEqual(['fail-1', 'fail-2'])
        expect(result.updated).toEqual([])
        expect(result.skipped).toEqual([])

        removeInstaller('fail-1')
        removeInstaller('fail-2')
    })

    it('returns correct result when no agents exist', async () => {
        clearInstallers()

        const result = await updateAllInstalledSkills(false)

        expect(result.updated).toEqual([])
        expect(result.skipped).toEqual([])
        expect(result.errors).toEqual([])
    })

    it('passes local flag through to isInstalled and update', async () => {
        setInstaller(
            'local-agent',
            mockInstaller({
                name: 'local-agent',
                isInstalled: vi.fn(async () => true),
            }),
        )

        await updateAllInstalledSkills(true)

        expect(getInstaller('local-agent').isInstalled).toHaveBeenCalledWith(true)
        expect(getInstaller('local-agent').update).toHaveBeenCalledWith(true)

        removeInstaller('local-agent')
    })
})
