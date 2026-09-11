import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { captureConsole, captureStream, createTestProgram } from '@doist/cli-core/testing'
import type { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { writeFakeGitRepo, writeFixtureExtension } from '../../test-support/extension-fixture.js'
import { registerExtensionGroup } from './commands.js'
import { createExtensionManager, type ExtensionManager } from './manager.js'
import { run as runProcess } from './run.js'

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

        it('shows the short SHA of a clone', async () => {
            const dir = await writeFixtureExtension(extensionsDir, 'standup', {})
            await runProcess('git', ['init', '--quiet', '--initial-branch=main'], { cwd: dir })
            await runProcess('git', ['add', '.'], { cwd: dir })
            await runProcess(
                'git',
                [
                    '-c',
                    'user.email=t@example.com',
                    '-c',
                    'user.name=T',
                    'commit',
                    '--quiet',
                    '-m',
                    'init',
                ],
                { cwd: dir },
            )
            const head = (
                await runProcess('git', ['rev-parse', 'HEAD'], { cwd: dir })
            ).stdout.trim()

            await run(makeManager(), ['extension', 'list'])
            const row = lines().find((line) => line.startsWith('standup'))
            expect(row).toContain(head.slice(0, 8))
            expect(row).toContain('git')
        })

        it('shows the pin, and the repository a clone came from', async () => {
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

    describe('install', () => {
        /** A directory the user is developing in, outside the extensions dir. */
        async function localSource(name: string): Promise<string> {
            await mkdir(join(root, 'code'), { recursive: true })
            return writeFixtureExtension(join(root, 'code'), name, {})
        }

        it('links a local directory and says where the link is', async () => {
            const target = await localSource('scratch')
            await run(makeManager(), ['extension', 'install', target])

            const entry = join(extensionsDir, 'td-scratch')
            expect((await lstat(entry)).isSymbolicLink()).toBe(true)
            expect(lines().join('\n')).toContain(`Linked td-scratch from ${target} to ${entry}`)
        })

        it('does not print the trust warning for the user own directory', async () => {
            await run(makeManager(), ['extension', 'install', await localSource('scratch')])
            expect(warnings).toEqual([])
        })

        it('reports the install as JSON', async () => {
            const target = await localSource('scratch')
            await run(makeManager(), ['extension', 'install', target, '--json'])
            expect(JSON.parse(lines().join(''))).toEqual({
                name: 'scratch',
                dirName: 'td-scratch',
                kind: 'local',
                source: target,
                dir: target,
            })
        })

        it('refuses a name that a built-in command already uses', async () => {
            const target = await localSource('task')
            await expect(
                run(makeManager({ reserved: ['task'] }), ['extension', 'install', target]),
            ).rejects.toMatchObject({ code: 'EXTENSION_NAME_RESERVED' })
            expect(await readdir(extensionsDir)).toEqual([])
        })

        it('links an extension that has not been built yet, with a warning', async () => {
            await mkdir(join(root, 'code', 'td-compiled'), { recursive: true })
            await run(makeManager(), ['extension', 'install', join(root, 'code', 'td-compiled')])

            expect((await lstat(join(extensionsDir, 'td-compiled'))).isSymbolicLink()).toBe(true)
            expect(warnings.join('\n')).toContain('has no executable named "td-compiled" yet')
        })

        it('refuses a directory that is not there', async () => {
            await expect(
                run(makeManager(), ['extension', 'install', join(root, 'code', 'td-missing')]),
            ).rejects.toMatchObject({ code: 'EXTENSION_NOT_INSTALLABLE' })
        })
    })

    describe('upgrade', () => {
        it('refuses names and --all together', async () => {
            await expect(
                run(makeManager(), ['extension', 'upgrade', 'goals', '--all']),
            ).rejects.toMatchObject({ code: 'CONFLICTING_OPTIONS' })
        })

        it('shows its usage when given neither a name nor --all', async () => {
            // Nothing is upgraded on a bare invocation, so nothing reaches the
            // network by accident.
            await expect(run(makeManager(), ['extension', 'upgrade'])).rejects.toThrow()
        })

        it('says so when there is nothing installed', async () => {
            await run(makeManager(), ['extension', 'upgrade', '--all'])
            expect(lines().join('\n')).toContain('No extensions installed.')
        })

        it('leaves a local install alone and says why', async () => {
            await mkdir(join(root, 'code'), { recursive: true })
            const target = await writeFixtureExtension(join(root, 'code'), 'scratch', {})
            await symlink(target, join(extensionsDir, 'td-scratch'))

            await run(makeManager(), ['extension', 'upgrade', '--all'])
            const row = lines().find((line) => line.startsWith('scratch'))
            expect(row).toContain('skipped')
        })

        it('reports a dry run without changing anything', async () => {
            await mkdir(join(root, 'code'), { recursive: true })
            const target = await writeFixtureExtension(join(root, 'code'), 'scratch', {})
            await symlink(target, join(extensionsDir, 'td-scratch'))
            const before = await readdir(extensionsDir)

            await run(makeManager(), ['extension', 'upgrade', '--all', '--dry-run'])
            const rendered = lines().join('\n')
            expect(rendered).toContain('[dry-run] Would upgrade 0 extensions:')
            expect(rendered).toContain('Run without --dry-run to execute.')
            expect(await readdir(extensionsDir)).toEqual(before)
        })

        it('names an extension that is not installed', async () => {
            await expect(
                run(makeManager(), ['extension', 'upgrade', 'ghost']),
            ).rejects.toMatchObject({ code: 'EXTENSION_NOT_FOUND' })
        })

        it('reports results as JSON', async () => {
            await mkdir(join(root, 'code'), { recursive: true })
            const target = await writeFixtureExtension(join(root, 'code'), 'scratch', {})
            await symlink(target, join(extensionsDir, 'td-scratch'))

            await run(makeManager(), ['extension', 'upgrade', '--all', '--json'])
            expect(JSON.parse(lines().join(''))).toEqual([
                { name: 'scratch', outcome: 'skipped', detail: expect.any(String) },
            ])
        })
    })

    describe('remove', () => {
        it('takes the link and leaves the user directory alone', async () => {
            await mkdir(join(root, 'code'), { recursive: true })
            const target = await writeFixtureExtension(join(root, 'code'), 'scratch', {})
            await symlink(target, join(extensionsDir, 'td-scratch'))

            await run(makeManager(), ['extension', 'remove', 'scratch'])

            expect(await readdir(extensionsDir)).toEqual([])
            expect(await readdir(target)).toContain('td-scratch')
            expect(lines().join('\n')).toContain('Its directory was left alone.')
        })

        it('removes a binary install outright', async () => {
            await writeFixtureExtension(extensionsDir, 'goals', {})
            await run(makeManager(), ['extension', 'remove', 'goals'])
            expect(await readdir(extensionsDir)).toEqual([])
            expect(lines().join('\n')).toContain('Removed goals from')
        })

        it('refuses a clone whose state it cannot read', async () => {
            const dir = await writeFixtureExtension(extensionsDir, 'standup', {})
            await writeFakeGitRepo(dir, 'https://github.com/example/td-standup.git')

            await expect(
                run(makeManager(), ['extension', 'remove', 'standup']),
            ).rejects.toMatchObject({ code: 'EXTENSION_DIRTY' })
            expect(await readdir(extensionsDir)).toEqual(['td-standup'])
        })

        it('removes it anyway with --force', async () => {
            const dir = await writeFixtureExtension(extensionsDir, 'standup', {})
            await writeFakeGitRepo(dir, 'https://github.com/example/td-standup.git')

            await run(makeManager(), ['extension', 'remove', 'standup', '--force'])
            expect(await readdir(extensionsDir)).toEqual([])
        })

        it('reports the removal as JSON', async () => {
            await writeFixtureExtension(extensionsDir, 'goals', {})
            await run(makeManager(), ['extension', 'remove', 'goals', '--json'])
            expect(JSON.parse(lines().join(''))).toMatchObject({
                name: 'goals',
                kind: 'binary',
                removed: 'directory',
            })
        })

        it('names an extension that is not installed', async () => {
            await expect(
                run(makeManager(), ['extension', 'remove', 'ghost']),
            ).rejects.toMatchObject({ code: 'EXTENSION_NOT_FOUND' })
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

        it('forwards --help rather than answering it', async () => {
            // The only way to reach the usage of an extension a built-in
            // command is hiding, so commander must not take the flag first.
            await writeFixtureExtension(extensionsDir, 'goals', {})
            await run(makeManager(), ['extension', 'exec', 'goals', '--help'])
            expect((await reported()).args).toEqual(['--help'])
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
