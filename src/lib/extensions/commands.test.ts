import { mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { captureConsole, captureStream, createTestProgram } from '@doist/cli-core/testing'
import type { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { writeFakeGitRepo, writeFixtureExtension } from '../../test-support/extension-fixture.js'
import { registerExtensionGroup } from './commands.js'
import { createExtensionManager, type ExtensionManager } from './manager.js'

describe('registerExtensionGroup', () => {
    let root: string
    let dataDir: string
    let extensionsDir: string
    let warnings: string[]
    let out: ReturnType<typeof captureConsole>

    function makeManager(
        options: { reserved?: string[]; accessible?: boolean } = {},
    ): ExtensionManager {
        return createExtensionManager({
            binName: 'td',
            envPrefix: 'TD',
            version: '5.3.1',
            dataDir,
            stateDir: join(root, 'state'),
            configDir: join(root, 'config'),
            hostPath: '/host/dist/index.js',
            reservedNames: () => options.reserved ?? [],
            officialSource: { host: 'github.com', owner: 'Doist' },
            officialLabel: 'Todoist',
            isAccessible: () => options.accessible ?? false,
            warn: (message) => warnings.push(message),
            log: () => undefined,
        })
    }

    function makeProgram(manager: ExtensionManager): Command {
        return createTestProgram((program) => {
            registerExtensionGroup(program, manager)
        })
    }

    /** Run the group the way the CLI would, argv included. */
    async function run(manager: ExtensionManager, args: string[]): Promise<void> {
        const argv = ['node', 'td', ...args]
        vi.spyOn(process, 'argv', 'get').mockReturnValue(argv)
        await makeProgram(manager).parseAsync(argv)
    }

    /** Everything written to stdout, as lines. */
    function lines(): string[] {
        return out.mock.calls.map((call) => String(call[0]))
    }

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'td-ext-commands-'))
        dataDir = join(root, 'todoist-cli')
        extensionsDir = join(dataDir, 'extensions')
        warnings = []
        await mkdir(extensionsDir, { recursive: true })
        out = captureConsole('log')
    })

    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })

    describe('the group itself', () => {
        it('registers under both `extension` and `ext`', () => {
            const program = makeProgram(makeManager())
            const group = program.commands.find((command) => command.name() === 'extension')
            expect(group?.aliases()).toContain('ext')
        })

        it('puts the trust warning in its help', () => {
            const manager = makeManager()
            const program = makeProgram(manager)
            const group = program.commands.find((command) => command.name() === 'extension')
            const stdout = captureStream('stdout')
            group?.outputHelp()
            expect(stdout.mock.calls.join('')).toContain(manager.trustWarning)
        })
    })

    describe('list', () => {
        it('says nothing is installed, and how to change that', async () => {
            await run(makeManager(), ['extension', 'list'])
            expect(lines().join('\n')).toContain(
                'No extensions installed. Run `td extension install <owner/repo>` to add one.',
            )
        })

        it('prints `[]` for --json when nothing is installed', async () => {
            await run(makeManager(), ['extension', 'list', '--json'])
            expect(lines()).toEqual(['[]'])
        })

        it('lines the columns up under their headers', async () => {
            await writeFixtureExtension(extensionsDir, 'goals', {
                installedManifest: {
                    owner: 'Doist',
                    name: 'td-goals',
                    host: 'github.com',
                    tag: 'v0.3.0',
                    pinned: false,
                    asset: 'td-goals_v0.3.0_linux-x64',
                    installedAt: '2026-09-07T10:12:00Z',
                    description: 'Track quarterly goals',
                },
            })
            await writeFixtureExtension(extensionsDir, 'standup', {})

            await run(makeManager(), ['extension', 'list'])
            const [header, ...rows] = lines()

            expect(header).toBe('NAME     SOURCE          VERSION  KIND    OFFICIAL')
            const goals = rows.find((row) => row.startsWith('goals'))
            expect(goals).toBe('goals    Doist/td-goals  v0.3.0   binary  ✓ Todoist')
            // A directory with neither a link, a clone, nor a manifest is a
            // binary install that nothing is known about.
            expect(rows.find((row) => row.startsWith('standup'))).toBe(
                'standup  —               —        binary',
            )
        })

        it('drops the tick in accessible mode but keeps the label', async () => {
            await writeFixtureExtension(extensionsDir, 'goals', {
                installedManifest: {
                    owner: 'Doist',
                    name: 'td-goals',
                    host: 'github.com',
                    tag: 'v0.3.0',
                    pinned: false,
                    asset: 'a',
                    installedAt: '2026-09-07T10:12:00Z',
                },
            })

            await run(makeManager({ accessible: true }), ['extension', 'list'])
            const row = lines().find((line) => line.startsWith('goals'))
            expect(row).toContain('Todoist')
            expect(row).not.toContain('✓')
        })

        it('does not call a non-Doist host official', async () => {
            const dir = await writeFixtureExtension(extensionsDir, 'goals', {})
            await writeFakeGitRepo(dir, 'https://git.example.com/Doist/td-goals.git')

            await run(makeManager(), ['extension', 'list', '--json'])
            const [entry] = JSON.parse(lines().join(''))
            expect(entry).toMatchObject({
                owner: 'Doist',
                host: 'git.example.com',
                official: false,
            })
        })

        it('notes an extension that cannot be run', async () => {
            await writeFixtureExtension(extensionsDir, 'goals', { notExecutable: true })
            await run(makeManager(), ['extension', 'list'])
            expect(lines().join('\n')).toContain('not executable')
        })

        it('notes an extension a built-in command hides', async () => {
            await writeFixtureExtension(extensionsDir, 'task', {})
            await run(makeManager({ reserved: ['task'] }), ['extension', 'list'])
            expect(lines().join('\n')).toContain('shadowed by built-in "task"')
        })

        it('notes a manifest this version cannot fully read', async () => {
            await writeFixtureExtension(extensionsDir, 'goals', {
                authoredManifest: { manifestVersion: 99, description: 'From the future' },
            })
            await run(makeManager(), ['extension', 'list'])
            expect(lines().join('\n')).toContain('manifest needs a newer td')
        })

        it('shows the pin, and the short SHA for a clone', async () => {
            const dir = await writeFixtureExtension(extensionsDir, 'standup', {})
            await writeFakeGitRepo(dir, 'https://github.com/example/td-standup.git')
            await writeFixtureExtension(extensionsDir, 'goals', {
                installedManifest: {
                    owner: 'Doist',
                    name: 'td-goals',
                    host: 'github.com',
                    tag: 'v0.3.0',
                    pinned: true,
                    asset: 'a',
                    installedAt: '2026-09-07T10:12:00Z',
                },
            })

            await run(makeManager(), ['extension', 'list'])
            const rendered = lines().join('\n')
            expect(rendered).toContain('binary (pinned)')
            expect(rendered).toContain('example/td-standup')
        })

        it('writes a path under the home directory the short way', async () => {
            // `os.homedir()` follows $HOME on POSIX, so this needs no mock.
            vi.stubEnv('HOME', root)
            await mkdir(join(root, 'code'), { recursive: true })
            await writeFixtureExtension(join(root, 'code'), 'scratch', {})
            await symlink(join(root, 'code', 'td-scratch'), join(extensionsDir, 'td-scratch'))

            await run(makeManager(), ['extension', 'list'])
            expect(lines().find((line) => line.startsWith('scratch'))).toContain(
                '~/code/td-scratch',
            )
            vi.unstubAllEnvs()
        })

        it('separates where the entry sits from where it points', async () => {
            const target = join(root, 'code', 'td-scratch')
            await mkdir(join(root, 'code'), { recursive: true })
            await writeFixtureExtension(join(root, 'code'), 'scratch', {})
            await symlink(target, join(extensionsDir, 'td-scratch'))

            await run(makeManager(), ['extension', 'list', '--json'])
            const [entry] = JSON.parse(lines().join(''))
            expect(entry.path).toBe(join(extensionsDir, 'td-scratch'))
            expect(entry.dir).toBe(target)
            expect(entry.kind).toBe('local')
        })

        it('leaves absent fields out of the JSON rather than nulling them', async () => {
            await writeFixtureExtension(extensionsDir, 'goals', {})
            await run(makeManager(), ['extension', 'list', '--json'])
            const [entry] = JSON.parse(lines().join(''))
            expect(entry).not.toHaveProperty('description')
            expect(entry).not.toHaveProperty('version')
            expect(entry).toMatchObject({ name: 'goals', executable: true, shadowed: false })
        })
    })

    describe('exec', () => {
        const report = () => join(root, 'report.json')

        async function reported(): Promise<{ args: string[]; env: Record<string, string> }> {
            return JSON.parse(await readFile(report(), 'utf8'))
        }

        beforeEach(() => {
            process.env.XX_REPORT = join(root, 'report.json')
        })

        afterEach(() => {
            delete process.env.XX_REPORT
        })

        it('hands every argument to the extension untouched', async () => {
            await writeFixtureExtension(extensionsDir, 'goals', {})
            // `--accessible` and `-q` are td's own flags, and commander would
            // eat them if the arguments came from it rather than from argv.
            await run(makeManager(), [
                'extension',
                'exec',
                'goals',
                '--json',
                '-q',
                '--accessible',
                '--',
                '--raw',
            ])
            expect((await reported()).args).toEqual(['--json', '-q', '--accessible', '--', '--raw'])
        })

        it('runs an extension with no arguments at all', async () => {
            await writeFixtureExtension(extensionsDir, 'goals', {})
            await run(makeManager(), ['extension', 'exec', 'goals'])
            expect((await reported()).args).toEqual([])
        })

        it('accepts the directory name and the owner-qualified form', async () => {
            await writeFixtureExtension(extensionsDir, 'goals', {})
            await run(makeManager(), ['extension', 'exec', 'td-goals'])
            expect((await reported()).env.TD_EXTENSION_NAME).toBe('goals')
        })

        it('exits with the extension exit code', async () => {
            await writeFixtureExtension(extensionsDir, 'goals', {})
            const previous = process.exitCode
            await run(makeManager(), ['extension', 'exec', 'goals', '--exit-code', '3'])
            expect(process.exitCode).toBe(3)
            process.exitCode = previous
        })

        it('reports an unknown name rather than failing to spawn it', async () => {
            await expect(run(makeManager(), ['extension', 'exec', 'ghost'])).rejects.toMatchObject({
                code: 'EXTENSION_NOT_FOUND',
                hints: ['Run `td extension list` to see what is installed.'],
            })
        })
    })
})
