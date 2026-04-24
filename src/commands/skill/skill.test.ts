import { access, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import checkbox from '@inquirer/checkbox'
import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('chalk')

vi.mock('@inquirer/checkbox', () => ({
    default: vi.fn(),
    Separator: class Separator {
        separator: string

        constructor(separator = '') {
            this.separator = separator
        }
    },
}))

vi.mock('../../lib/skills/update-installed.js', () => ({
    updateAllInstalledSkills: vi.fn(),
}))

import { createInstaller } from '../../lib/skills/create-installer.js'
import { getInstaller, listAgents, skillInstallers } from '../../lib/skills/index.js'
import { updateAllInstalledSkills } from '../../lib/skills/update-installed.js'
import { registerSkillCommand } from './index.js'

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerSkillCommand(program)
    return program
}

const mockCheckbox = vi.mocked(checkbox)

function getPromptEntries() {
    const [config] = mockCheckbox.mock.calls.at(-1) ?? []
    if (!config || !('choices' in config)) {
        throw new Error('Expected checkbox prompt to be called with choices.')
    }

    return config.choices
}

function getPromptChoices() {
    return getPromptEntries().filter(
        (choice): choice is { value: string; name: string; checked?: boolean } =>
            typeof choice === 'object' && choice !== null && 'value' in choice,
    )
}

describe('skill command', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>
    let originalStdinIsTTY: PropertyDescriptor | undefined
    let originalStdoutIsTTY: PropertyDescriptor | undefined
    let originalHome: string | undefined

    beforeEach(() => {
        vi.clearAllMocks()
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        originalStdinIsTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY')
        originalStdoutIsTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
        originalHome = process.env.HOME
    })

    afterEach(() => {
        consoleSpy.mockRestore()
        if (originalStdinIsTTY) {
            Object.defineProperty(process.stdin, 'isTTY', originalStdinIsTTY)
        }
        if (originalStdoutIsTTY) {
            Object.defineProperty(process.stdout, 'isTTY', originalStdoutIsTTY)
        }
        if (originalHome === undefined) {
            delete process.env.HOME
        } else {
            process.env.HOME = originalHome
        }
    })

    describe('list subcommand', () => {
        it('lists available agents', async () => {
            const program = createProgram()
            await program.parseAsync(['node', 'td', 'skill', 'list'])

            expect(consoleSpy).toHaveBeenCalledWith('Available agents:')
            expect(consoleSpy).toHaveBeenCalledWith('  claude-code')
            expect(consoleSpy).toHaveBeenCalledWith('  codex')
            expect(consoleSpy).toHaveBeenCalledWith('  cursor')
            expect(consoleSpy).toHaveBeenCalledWith('  gemini')
            expect(consoleSpy).toHaveBeenCalledWith('  pi')
            expect(consoleSpy).toHaveBeenCalledWith('  universal')
        })
    })

    describe('install subcommand', () => {
        it('includes supported agent names in install help', async () => {
            const program = createProgram()
            let output = ''
            const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
                output += String(chunk)
                return true
            })

            await expect(
                program.parseAsync(['node', 'td', 'skill', 'install', '--help']),
            ).rejects.toThrow()
            writeSpy.mockRestore()
            expect(output).toContain('Supported agents:')
            expect(output).toContain('claude-code, codex, cursor, gemini, pi, universal')
            expect(output).toContain(
                'Use arrow keys to navigate, Space to toggle, Enter to install, or Ctrl+C to cancel.',
            )
            expect(output).toContain('The first viable target is preselected by default.')
        })

        it('shows help when no agent provided in a non-interactive environment', async () => {
            const program = createProgram()

            Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })
            Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true })

            await expect(program.parseAsync(['node', 'td', 'skill', 'install'])).rejects.toThrow()
        })

        it('errors for unknown agent', async () => {
            const program = createProgram()

            await expect(
                program.parseAsync(['node', 'td', 'skill', 'install', 'unknown-agent']),
            ).rejects.toThrow('Unknown agent: unknown-agent')
        })

        it('prompts interactively and defaults to the first detected agent root', async () => {
            const program = createProgram()
            const testDir = await mkdtemp(join(tmpdir(), 'skill-install-local-'))
            const originalCwd = process.cwd()

            Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
            Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
            mockCheckbox.mockResolvedValue(['codex'])

            process.chdir(testDir)
            try {
                await mkdir(join(testDir, '.codex'), { recursive: true })

                await program.parseAsync(['node', 'td', 'skill', 'install', '--local'])

                const choices = getPromptChoices()
                await expect(
                    access(join(testDir, '.codex', 'skills', 'todoist-cli', 'SKILL.md')),
                ).resolves.toBeUndefined()
                expect(choices[0]).toMatchObject({
                    value: 'codex',
                    name: 'codex (detected)',
                    checked: true,
                })
                expect(consoleSpy).toHaveBeenCalledWith('✓', 'Installed codex skill')
            } finally {
                process.chdir(originalCwd)
                await rm(testDir, { recursive: true, force: true })
            }
        })

        it('puts universal first when no agent-specific roots exist', async () => {
            const program = createProgram()
            const testDir = await mkdtemp(join(tmpdir(), 'skill-install-universal-'))
            const originalCwd = process.cwd()

            Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
            Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
            mockCheckbox.mockResolvedValue(['universal'])

            process.chdir(testDir)
            try {
                await program.parseAsync(['node', 'td', 'skill', 'install', '--local'])

                const choices = getPromptChoices()
                await expect(
                    access(join(testDir, '.agents', 'skills', 'todoist-cli', 'SKILL.md')),
                ).resolves.toBeUndefined()
                expect(choices[0]).toMatchObject({
                    value: 'universal',
                    name: 'universal (available)',
                    checked: true,
                })
                expect(consoleSpy).toHaveBeenCalledWith('✓', 'Installed universal skill')
            } finally {
                process.chdir(originalCwd)
                await rm(testDir, { recursive: true, force: true })
            }
        })

        it('omits unavailable non-universal options in global mode', async () => {
            const program = createProgram()
            const testDir = await mkdtemp(join(tmpdir(), 'skill-install-global-'))

            process.env.HOME = testDir
            Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
            Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
            mockCheckbox.mockResolvedValue(['universal'])

            try {
                await program.parseAsync(['node', 'td', 'skill', 'install'])

                const choices = getPromptChoices()
                await expect(
                    access(join(testDir, '.agents', 'skills', 'todoist-cli', 'SKILL.md')),
                ).resolves.toBeUndefined()
                expect(choices).toHaveLength(1)
                expect(choices[0]).toMatchObject({
                    value: 'universal',
                    name: 'universal (available)',
                    checked: true,
                })
            } finally {
                await rm(testDir, { recursive: true, force: true })
            }
        })

        it('installs every selected option from the checklist', async () => {
            const program = createProgram()
            const testDir = await mkdtemp(join(tmpdir(), 'skill-install-choice-'))
            const originalCwd = process.cwd()

            Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
            Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
            mockCheckbox.mockResolvedValue(['codex', 'claude-code'])

            process.chdir(testDir)
            try {
                await program.parseAsync(['node', 'td', 'skill', 'install', '--local'])

                await expect(
                    access(join(testDir, '.codex', 'skills', 'todoist-cli', 'SKILL.md')),
                ).resolves.toBeUndefined()
                await expect(
                    access(join(testDir, '.claude', 'skills', 'todoist-cli', 'SKILL.md')),
                ).resolves.toBeUndefined()
                expect(consoleSpy).toHaveBeenCalledWith('✓', 'Installed codex skill')
                expect(consoleSpy).toHaveBeenCalledWith('✓', 'Installed claude-code skill')
            } finally {
                process.chdir(originalCwd)
                await rm(testDir, { recursive: true, force: true })
            }
        })

        it('validates the full multi-select before writing any files', async () => {
            const program = createProgram()
            const testDir = await mkdtemp(join(tmpdir(), 'skill-install-invalid-'))
            const originalCwd = process.cwd()

            Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
            Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
            mockCheckbox.mockResolvedValue(['codex', 'claude-code'])

            process.chdir(testDir)
            try {
                const existingSkillPath = join(
                    testDir,
                    '.claude',
                    'skills',
                    'todoist-cli',
                    'SKILL.md',
                )
                await mkdir(join(testDir, '.claude', 'skills', 'todoist-cli'), { recursive: true })
                await writeFile(existingSkillPath, 'existing skill', 'utf-8')

                await expect(
                    program.parseAsync(['node', 'td', 'skill', 'install', '--local']),
                ).rejects.toThrow(
                    /Skill file already exists at .*\.claude\/skills\/todoist-cli\/SKILL\.md\. Use --force to overwrite\./,
                )

                await expect(
                    access(join(testDir, '.codex', 'skills', 'todoist-cli', 'SKILL.md')),
                ).rejects.toThrow()
            } finally {
                process.chdir(originalCwd)
                await rm(testDir, { recursive: true, force: true })
            }
        })

        it('allows cancelling the interactive chooser without installing anything', async () => {
            const program = createProgram()
            const testDir = await mkdtemp(join(tmpdir(), 'skill-install-cancel-'))
            const originalCwd = process.cwd()

            Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
            Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
            const promptError = new Error('Prompt cancelled')
            promptError.name = 'ExitPromptError'
            mockCheckbox.mockRejectedValue(promptError)

            process.chdir(testDir)
            try {
                await program.parseAsync(['node', 'td', 'skill', 'install', '--local'])

                await expect(
                    access(join(testDir, '.agents', 'skills', 'todoist-cli', 'SKILL.md')),
                ).rejects.toThrow()
                expect(consoleSpy).toHaveBeenCalledWith('Cancelled.')
            } finally {
                process.chdir(originalCwd)
                await rm(testDir, { recursive: true, force: true })
            }
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

    it('returns gemini installer', () => {
        const installer = getInstaller('gemini')
        expect(installer).toBeDefined()
        expect(installer?.name).toBe('gemini')
    })

    it('returns pi installer', () => {
        const installer = getInstaller('pi')
        expect(installer).toBeDefined()
        expect(installer?.name).toBe('pi')
    })

    it('returns universal installer', () => {
        const installer = getInstaller('universal')
        expect(installer).toBeDefined()
        expect(installer?.name).toBe('universal')
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
        expect(agents).toContain('gemini')
        expect(agents).toContain('pi')
        expect(agents).toContain('universal')
    })
})

describe('installer paths', () => {
    const cases = [
        { agent: 'claude-code', dir: '.claude', desc: 'Claude Code skill for Todoist CLI' },
        { agent: 'codex', dir: '.codex', desc: 'Codex skill for Todoist CLI' },
        { agent: 'cursor', dir: '.cursor', desc: 'Cursor skill for Todoist CLI' },
        { agent: 'gemini', dir: '.gemini', desc: 'Gemini CLI skill for Todoist CLI' },
        { agent: 'pi', dir: '.pi', desc: 'Pi skill for Todoist CLI' },
        { agent: 'universal', dir: '.agents', desc: 'Universal agent skill for Todoist CLI' },
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

            it(`returns global root path containing ${dir}`, () => {
                const globalRootPath = installer.getAgentRootPath(false)
                expect(globalRootPath).toContain(dir)
                expect(globalRootPath.endsWith(dir)).toBe(true)
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
        expect(content).toContain('name: todoist-cli')
        expect(content).toContain('description: "Manage Todoist tasks, projects, labels')
        expect(content).toContain('Use when the user wants to view, create, update')
        expect(content).toContain('compatibility: ')
        expect(content).toContain('license: MIT')
        expect(content).toContain('author: Doist')
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
        expect(written).toContain('name: todoist-cli')
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

    it('skips agent directory check for universal (.agents)', async () => {
        const testDir = await mkdtemp(join(tmpdir(), 'skill-universal-test-'))
        const originalCwd = process.cwd()
        process.chdir(testDir)
        try {
            const installer = createInstaller({
                name: 'universal',
                description: 'Universal agent',
                dirName: '.agents',
            })
            await expect(installer.install(true, false)).resolves.not.toThrow()
        } finally {
            process.chdir(originalCwd)
            await rm(testDir, { recursive: true, force: true })
        }
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
        expect(written).toContain('name: todoist-cli')
        expect(written).not.toBe('old content')
    })
})
