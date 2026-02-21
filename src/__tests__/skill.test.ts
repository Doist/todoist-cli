import { access, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('chalk')

vi.mock('../lib/skills/update-installed.js', () => ({
    updateAllInstalledSkills: vi.fn(),
}))

import { registerSkillCommand } from '../commands/skill.js'
import { createInstaller } from '../lib/skills/create-installer.js'
import { getInstaller, listAgents, skillInstallers } from '../lib/skills/index.js'
import { updateAllInstalledSkills } from '../lib/skills/update-installed.js'

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerSkillCommand(program)
    return program
}

describe('skill command', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
        consoleSpy.mockRestore()
    })

    describe('list subcommand', () => {
        it('lists available agents', async () => {
            const program = createProgram()
            await program.parseAsync(['node', 'td', 'skill', 'list'])

            expect(consoleSpy).toHaveBeenCalledWith('Available agents:')
            expect(consoleSpy).toHaveBeenCalledWith('  claude-code')
            expect(consoleSpy).toHaveBeenCalledWith('  codex')
            expect(consoleSpy).toHaveBeenCalledWith('  cursor')
        })
    })

    describe('install subcommand', () => {
        it('shows help when no agent provided', async () => {
            const program = createProgram()

            await expect(program.parseAsync(['node', 'td', 'skill', 'install'])).rejects.toThrow()
        })

        it('errors for unknown agent', async () => {
            const program = createProgram()

            await expect(
                program.parseAsync(['node', 'td', 'skill', 'install', 'unknown-agent']),
            ).rejects.toThrow('Unknown agent: unknown-agent')
        })
    })

    describe('update subcommand', () => {
        it('shows help when no agent provided', async () => {
            const program = createProgram()

            await expect(program.parseAsync(['node', 'td', 'skill', 'update'])).rejects.toThrow()
        })

        it('errors for unknown agent', async () => {
            const program = createProgram()

            await expect(
                program.parseAsync(['node', 'td', 'skill', 'update', 'unknown-agent']),
            ).rejects.toThrow('Unknown agent: unknown-agent')
        })

        it('updates all installed agents when "all" is passed', async () => {
            vi.mocked(updateAllInstalledSkills).mockResolvedValue({
                updated: ['claude-code', 'cursor'],
                skipped: ['codex'],
                errors: [],
            })

            const program = createProgram()
            await program.parseAsync(['node', 'td', 'skill', 'update', 'all'])

            expect(updateAllInstalledSkills).toHaveBeenCalledWith(false)
            expect(consoleSpy).toHaveBeenCalledWith('✓', 'Updated claude-code skill')
            expect(consoleSpy).toHaveBeenCalledWith('✓', 'Updated cursor skill')
            expect(consoleSpy).toHaveBeenCalledWith('  Skipped codex (not installed)')
        })

        it('shows message when no agents are installed for "all"', async () => {
            vi.mocked(updateAllInstalledSkills).mockResolvedValue({
                updated: [],
                skipped: ['claude-code', 'codex', 'cursor'],
                errors: [],
            })

            const program = createProgram()
            await program.parseAsync(['node', 'td', 'skill', 'update', 'all'])

            expect(updateAllInstalledSkills).toHaveBeenCalledWith(false)
            expect(consoleSpy).toHaveBeenCalledWith('No installed skills found to update.')
        })
    })

    describe('uninstall subcommand', () => {
        it('shows help when no agent provided', async () => {
            const program = createProgram()

            await expect(program.parseAsync(['node', 'td', 'skill', 'uninstall'])).rejects.toThrow()
        })

        it('errors for unknown agent', async () => {
            const program = createProgram()

            await expect(
                program.parseAsync(['node', 'td', 'skill', 'uninstall', 'unknown-agent']),
            ).rejects.toThrow('Unknown agent: unknown-agent')
        })
    })
})

describe('skills registry', () => {
    it('returns claude-code installer', () => {
        const installer = getInstaller('claude-code')
        expect(installer).toBeDefined()
        expect(installer?.name).toBe('claude-code')
    })

    it('returns codex installer', () => {
        const installer = getInstaller('codex')
        expect(installer).toBeDefined()
        expect(installer?.name).toBe('codex')
    })

    it('returns cursor installer', () => {
        const installer = getInstaller('cursor')
        expect(installer).toBeDefined()
        expect(installer?.name).toBe('cursor')
    })

    it('returns undefined for unknown agent', () => {
        const installer = getInstaller('unknown')
        expect(installer).toBeUndefined()
    })

    it('lists all available agents', () => {
        const agents = listAgents()
        expect(agents).toContain('claude-code')
        expect(agents).toContain('codex')
        expect(agents).toContain('cursor')
    })
})

describe('installer paths', () => {
    const cases = [
        { agent: 'claude-code', dir: '.claude', desc: 'Claude Code skill for Todoist CLI' },
        { agent: 'codex', dir: '.codex', desc: 'Codex skill for Todoist CLI' },
        { agent: 'cursor', dir: '.cursor', desc: 'Cursor skill for Todoist CLI' },
    ] as const

    for (const { agent, dir, desc } of cases) {
        describe(agent, () => {
            const installer = skillInstallers[agent]

            it('has correct name and description', () => {
                expect(installer.name).toBe(agent)
                expect(installer.description).toBe(desc)
            })

            it(`returns global path containing ${dir}/skills`, () => {
                const globalPath = installer.getInstallPath(false)
                expect(globalPath).toContain(dir)
                expect(globalPath).toContain('skills')
                expect(globalPath).toContain('todoist-cli')
                expect(globalPath).toContain('SKILL.md')
            })

            it('returns local path containing cwd', () => {
                const localPath = installer.getInstallPath(true)
                expect(localPath).toContain(dir)
                expect(localPath).toContain('skills')
                expect(localPath).toContain('todoist-cli')
                expect(localPath).toContain('SKILL.md')
                expect(localPath).toContain(process.cwd())
            })
        })
    }

    it('generates skill file with YAML frontmatter', () => {
        const content = skillInstallers['claude-code'].generateContent()
        expect(content).toContain('---')
        expect(content).toContain('name: todoist')
        expect(content).toContain('description: Manage Todoist tasks')
        expect(content).toContain('# Todoist CLI (td)')
        expect(content).toContain('td today')
        expect(content).toContain('td task add')
    })
})

describe('installer file operations', () => {
    let testDir: string
    let skillFile: string

    beforeEach(async () => {
        testDir = await mkdtemp(join(tmpdir(), 'skill-test-'))
        skillFile = join(testDir, 'SKILL.md')
    })

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true })
    })

    it('creates directory structure and writes file', async () => {
        const content = skillInstallers['claude-code'].generateContent()
        const targetDir = join(testDir, 'nested', 'dir')
        const targetFile = join(targetDir, 'SKILL.md')

        await mkdir(targetDir, { recursive: true })
        await writeFile(targetFile, content, 'utf-8')

        const written = await readFile(targetFile, 'utf-8')
        expect(written).toContain('name: todoist')
    })

    it('detects existing file', async () => {
        await writeFile(skillFile, 'test', 'utf-8')

        try {
            await access(skillFile)
            expect(true).toBe(true)
        } catch {
            expect(false).toBe(true)
        }
    })

    it('removes file correctly', async () => {
        await writeFile(skillFile, 'test', 'utf-8')
        await unlink(skillFile)

        try {
            await access(skillFile)
            expect(false).toBe(true)
        } catch {
            expect(true).toBe(true)
        }
    })
})

describe('install detection', () => {
    it('throws when agent directory does not exist', async () => {
        const installer = createInstaller({
            name: 'fake-agent',
            description: 'Fake agent',
            dirName: '.nonexistent-agent-dir-xyz',
        })

        await expect(installer.install(false, false)).rejects.toThrow(
            'fake-agent does not appear to be installed',
        )
    })
})

describe('update file operations', () => {
    let testDir: string

    beforeEach(async () => {
        testDir = await mkdtemp(join(tmpdir(), 'skill-update-test-'))
    })

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true })
    })

    it('overwrites existing skill file with latest content', async () => {
        const targetDir = join(testDir, 'skills', 'todoist-cli')
        const targetFile = join(targetDir, 'SKILL.md')
        await mkdir(targetDir, { recursive: true })
        await writeFile(targetFile, 'old content', 'utf-8')

        const installer = skillInstallers['claude-code']
        const latestContent = installer.generateContent()
        await writeFile(targetFile, latestContent, 'utf-8')

        const written = await readFile(targetFile, 'utf-8')
        expect(written).toContain('name: todoist')
        expect(written).not.toBe('old content')
    })
})
