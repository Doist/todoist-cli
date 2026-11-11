import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import packageJson from '../../../package.json' with { type: 'json' }
import { getConfigPath } from '../../lib/config.js'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))

vi.mock('node:child_process', async (importOriginal) => ({
    ...(await importOriginal<typeof import('node:child_process')>()),
    spawn: spawnMock,
}))

vi.mock('chalk')

const NPM_SCRIPT = '/usr/local/lib/node_modules/@doist/todoist-cli/dist/index.js'
const PNPM_SCRIPT =
    '/home/user/.local/share/pnpm/global/5/node_modules/@doist/todoist-cli/dist/index.js'
const BREW_SCRIPT =
    '/opt/homebrew/Cellar/todoist-cli/5.13.0/libexec/lib/node_modules/@doist/todoist-cli/dist/index.js'

const originalScript = process.argv[1]
const originalExecPath = process.execPath

let configHome: string

/** Pretend td is running from `script`, launched straight from the shell. */
function runningFrom(script: string) {
    process.argv[1] = script
    process.execPath = '/usr/local/bin/node'
    vi.stubEnv('npm_execpath', '')
}

/** Each spawned command exits with the next code in turn (0 once they run out). */
function exitCodes(...codes: number[]) {
    let call = 0
    spawnMock.mockImplementation(() => {
        const child = new EventEmitter()
        const code = codes[call++] ?? 0
        setImmediate(() => child.emit('close', code))
        return child
    })
}

function spawnedCommands(): string[] {
    return spawnMock.mock.calls.map(([command, args]) => [command, ...args].join(' '))
}

function stubRegistry(response: { ok: boolean; status?: number; version?: string }) {
    const fetchMock = vi.fn().mockResolvedValue({
        ok: response.ok,
        status: response.status ?? 200,
        json: () => Promise.resolve({ version: response.version }),
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
}

async function writeConfig(config: Record<string, unknown>) {
    await mkdir(join(configHome, 'todoist-cli'), { recursive: true })
    await writeFile(join(configHome, 'todoist-cli', 'config.json'), JSON.stringify(config))
}

async function runUpdate(...args: string[]) {
    const { registerUpdateCommand } = await import('./index.js')
    const program = new Command()
    program.exitOverride()
    registerUpdateCommand(program)
    await program.parseAsync(['node', 'td', 'update', ...args])
}

describe('update wrapper', () => {
    let log: ReturnType<typeof vi.spyOn>
    let error: ReturnType<typeof vi.spyOn>

    beforeEach(async () => {
        configHome = await mkdtemp(join(tmpdir(), 'td-update-'))
        vi.stubEnv('XDG_CONFIG_HOME', configHome)
        runningFrom(NPM_SCRIPT)
        exitCodes()
        log = vi.spyOn(console, 'log').mockImplementation(() => {})
        error = vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(async () => {
        process.argv[1] = originalScript
        process.execPath = originalExecPath
        spawnMock.mockReset()
        vi.doUnmock('@doist/cli-core/commands')
        vi.resetModules()
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
        vi.unstubAllEnvs()
        await rm(configHome, { recursive: true, force: true })
    })

    function logged(): string[] {
        return log.mock.calls.map(([line]: unknown[]) => String(line))
    }

    it('forwards todoist-cli wiring (packageName, version, configPath, changelog hint, spinner) to cli-core', async () => {
        const registerCoreSpy = vi.fn()
        vi.doMock('@doist/cli-core/commands', () => ({
            registerUpdateCommand: registerCoreSpy,
        }))

        const { registerUpdateCommand } = await import('./index.js')
        const { withSpinner } = await import('../../lib/spinner.js')
        const program = new Command()
        registerUpdateCommand(program)

        expect(registerCoreSpy).toHaveBeenCalledTimes(1)
        const [passedProgram, options] = registerCoreSpy.mock.calls[0]
        expect(passedProgram).toBe(program)
        expect(options).toEqual({
            packageName: packageJson.name,
            currentVersion: packageJson.version,
            configPath: getConfigPath(),
            changelogCommandName: 'td changelog',
            withSpinner,
        })
    })

    describe('Homebrew install', () => {
        it('keeps the cli-core update, checking the registry for this package', async () => {
            runningFrom(BREW_SCRIPT)
            const fetchMock = stubRegistry({ ok: true, version: packageJson.version })

            await runUpdate('--check')

            expect(fetchMock).toHaveBeenCalledTimes(1)
            expect(fetchMock.mock.calls[0][0]).toBe(
                'https://registry.npmjs.org/@doist/todoist-cli/latest',
            )
            expect(logged()).toEqual([
                `✓ Already up to date (v${packageJson.version})`,
                '  Channel: stable',
            ])
        })
    })

    describe('npm install', () => {
        it('uninstalls @doist/todoist-cli, then installs @todoist/cli@latest with output streamed', async () => {
            const fetchMock = stubRegistry({ ok: true, version: '6.0.1' })

            await runUpdate()

            expect(fetchMock.mock.calls[0][0]).toBe(
                'https://registry.npmjs.org/@todoist/cli/latest',
            )
            expect(spawnedCommands()).toEqual([
                'npm uninstall -g @doist/todoist-cli',
                'npm install -g @todoist/cli@latest',
            ])
            for (const [, , options] of spawnMock.mock.calls) {
                expect(options).toEqual({ stdio: 'inherit', shell: false })
            }
            expect(logged()).toEqual([
                `td has moved to @todoist/cli. Switching from @doist/todoist-cli v${packageJson.version} to @todoist/cli v6.0.1.`,
                '$ npm uninstall -g @doist/todoist-cli',
                '$ npm install -g @todoist/cli@latest',
                '✓ Installed @todoist/cli v6.0.1',
                '  td keeps working with the same config and login.',
            ])
        })

        it('installs @todoist/cli@next on the pre-release channel', async () => {
            await writeConfig({ update_channel: 'pre-release' })
            const fetchMock = stubRegistry({ ok: true, version: '6.1.0-next.1' })

            await runUpdate()

            expect(fetchMock.mock.calls[0][0]).toBe('https://registry.npmjs.org/@todoist/cli/next')
            expect(spawnedCommands()).toEqual([
                'npm uninstall -g @doist/todoist-cli',
                'npm install -g @todoist/cli@next',
            ])
        })

        it('restores the old package and fails when the new one does not install', async () => {
            stubRegistry({ ok: true, version: '6.0.1' })
            exitCodes(0, 1, 0)

            await expect(runUpdate()).rejects.toMatchObject({
                code: 'UPDATE_INSTALL_FAILED',
                message: `npm could not install @todoist/cli@latest. @doist/todoist-cli v${packageJson.version} has been restored.`,
                hints: [
                    'Run: npm uninstall -g @doist/todoist-cli',
                    'Run: npm install -g @todoist/cli@latest',
                ],
            })
            expect(spawnedCommands()).toEqual([
                'npm uninstall -g @doist/todoist-cli',
                'npm install -g @todoist/cli@latest',
                `npm install -g @doist/todoist-cli@${packageJson.version}`,
            ])
            expect(logged()).not.toContain('✓ Installed @todoist/cli v6.0.1')
        })

        it('says td may be gone when the restore fails too', async () => {
            stubRegistry({ ok: true, version: '6.0.1' })
            exitCodes(0, 1, 1)

            await expect(runUpdate()).rejects.toMatchObject({
                code: 'UPDATE_INSTALL_FAILED',
                message: `npm could not install @todoist/cli@latest, and could not restore @doist/todoist-cli v${packageJson.version}, so td may no longer be installed.`,
            })
            expect(spawnedCommands()).toHaveLength(3)
        })

        it('installs nothing when the uninstall fails', async () => {
            stubRegistry({ ok: true, version: '6.0.1' })
            exitCodes(1)

            await expect(runUpdate()).rejects.toMatchObject({
                code: 'UPDATE_INSTALL_FAILED',
                message: 'npm could not uninstall @doist/todoist-cli. Nothing was changed.',
            })
            expect(spawnedCommands()).toEqual(['npm uninstall -g @doist/todoist-cli'])
        })

        it('treats a package manager that cannot start as a failed step', async () => {
            stubRegistry({ ok: true, version: '6.0.1' })
            spawnMock.mockImplementation(() => {
                const child = new EventEmitter()
                setImmediate(() => child.emit('error', new Error('spawn npm ENOENT')))
                return child
            })

            await expect(runUpdate()).rejects.toMatchObject({ code: 'UPDATE_INSTALL_FAILED' })
            expect(spawnedCommands()).toEqual(['npm uninstall -g @doist/todoist-cli'])
            expect(error).toHaveBeenCalledWith('Could not run npm: spawn npm ENOENT')
        })

        it('changes nothing when the new package cannot be looked up', async () => {
            await writeConfig({ update_channel: 'pre-release' })
            stubRegistry({ ok: false, status: 404 })

            await expect(runUpdate()).rejects.toMatchObject({
                code: 'UPDATE_CHECK_FAILED',
                message:
                    'Could not look up @todoist/cli@next: Registry request failed (HTTP 404). Nothing was changed.',
                hints: ['Switch to the stable channel and try again: td update switch --stable'],
            })
            expect(spawnMock).not.toHaveBeenCalled()
        })

        it('--check reports the move without touching the registry or the install', async () => {
            const fetchMock = stubRegistry({ ok: true, version: '6.0.1' })

            await runUpdate('--check')

            expect(fetchMock).not.toHaveBeenCalled()
            expect(spawnMock).not.toHaveBeenCalled()
            expect(logged()).toEqual([
                'td has moved to @todoist/cli.',
                `  Installed: @doist/todoist-cli v${packageJson.version}`,
                '  Run td update to switch, or by hand:',
                '    npm uninstall -g @doist/todoist-cli',
                '    npm install -g @todoist/cli@latest',
            ])
        })

        it.each([['--json'], ['--check', '--json']])(
            '%s reports the move as JSON without changing anything',
            async (...args) => {
                const fetchMock = stubRegistry({ ok: true, version: '6.0.1' })

                await runUpdate(...args)

                expect(fetchMock).not.toHaveBeenCalled()
                expect(spawnMock).not.toHaveBeenCalled()
                expect(log).toHaveBeenCalledTimes(1)
                expect(JSON.parse(String(log.mock.calls[0][0]))).toEqual({
                    currentVersion: packageJson.version,
                    channel: 'stable',
                    updateAvailable: true,
                    movedTo: '@todoist/cli',
                    command: 'td update',
                    manualCommands: [
                        'npm uninstall -g @doist/todoist-cli',
                        'npm install -g @todoist/cli@latest',
                    ],
                })
            },
        )

        it('--ndjson reports the move as one record', async () => {
            await runUpdate('--ndjson')

            expect(spawnMock).not.toHaveBeenCalled()
            expect(log).toHaveBeenCalledTimes(1)
            expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({
                movedTo: '@todoist/cli',
                command: 'td update',
            })
        })

        it('--channel still shows the configured channel', async () => {
            await writeConfig({ update_channel: 'pre-release' })

            await runUpdate('--channel')

            expect(logged()).toEqual(['Update channel: pre-release'])
            expect(spawnMock).not.toHaveBeenCalled()
        })

        it('`update switch` still sets the channel', async () => {
            await runUpdate('switch', '--pre-release')

            const config = JSON.parse(
                await readFile(join(configHome, 'todoist-cli', 'config.json'), 'utf8'),
            )
            expect(config.update_channel).toBe('pre-release')
            expect(spawnMock).not.toHaveBeenCalled()
        })
    })

    describe('pnpm install', () => {
        it('removes @doist/todoist-cli, then adds @todoist/cli@latest', async () => {
            runningFrom(PNPM_SCRIPT)
            stubRegistry({ ok: true, version: '6.0.1' })

            await runUpdate()

            expect(spawnedCommands()).toEqual([
                'pnpm remove -g @doist/todoist-cli',
                'pnpm add -g @todoist/cli@latest',
            ])
        })

        it('restores the old package with pnpm when the new one does not install', async () => {
            runningFrom(PNPM_SCRIPT)
            stubRegistry({ ok: true, version: '6.0.1' })
            exitCodes(0, 1, 0)

            await expect(runUpdate()).rejects.toMatchObject({
                code: 'UPDATE_INSTALL_FAILED',
                hints: [
                    'Run: pnpm remove -g @doist/todoist-cli',
                    'Run: pnpm add -g @todoist/cli@latest',
                ],
            })
            expect(spawnedCommands()).toEqual([
                'pnpm remove -g @doist/todoist-cli',
                'pnpm add -g @todoist/cli@latest',
                `pnpm add -g @doist/todoist-cli@${packageJson.version}`,
            ])
        })
    })
})
