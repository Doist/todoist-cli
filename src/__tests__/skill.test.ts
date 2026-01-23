import { access, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('chalk', () => ({
    default: {
        green: vi.fn((text) => text),
        dim: vi.fn((text) => text),
        bold: vi.fn((text) => text),
        red: vi.fn((text) => text),
    },
}))

import { registerSkillCommand } from '../commands/skill.js'
import { claudeCodeInstaller } from '../lib/skills/claude-code.js'
import { getInstaller, listAgents } from '../lib/skills/index.js'

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

    it('returns undefined for unknown agent', () => {
        const installer = getInstaller('unknown')
        expect(installer).toBeUndefined()
    })

    it('lists available agents', () => {
        const agents = listAgents()
        expect(agents).toContain('claude-code')
    })
})

describe('claudeCodeInstaller', () => {
    it('has correct name and description', () => {
        expect(claudeCodeInstaller.name).toBe('claude-code')
        expect(claudeCodeInstaller.description).toBe('Claude Code skill for Todoist CLI')
    })

    it('generates skill file with YAML frontmatter', () => {
        const content = claudeCodeInstaller.generateContent()

        expect(content).toContain('---')
        expect(content).toContain('name: todoist')
        expect(content).toContain('description: Manage Todoist tasks')
        expect(content).toContain('# Todoist CLI (td)')
        expect(content).toContain('td today')
        expect(content).toContain('td add')
    })

    it('returns global path containing .claude/skills', () => {
        const globalPath = claudeCodeInstaller.getInstallPath(false)
        expect(globalPath).toContain('.claude')
        expect(globalPath).toContain('skills')
        expect(globalPath).toContain('todoist-cli')
        expect(globalPath).toContain('SKILL.md')
    })

    it('returns local path containing cwd', () => {
        const localPath = claudeCodeInstaller.getInstallPath(true)
        expect(localPath).toContain('.claude')
        expect(localPath).toContain('skills')
        expect(localPath).toContain('todoist-cli')
        expect(localPath).toContain('SKILL.md')
        expect(localPath).toContain(process.cwd())
    })

    describe('install/uninstall operations', () => {
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
            const content = claudeCodeInstaller.generateContent()
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
})
