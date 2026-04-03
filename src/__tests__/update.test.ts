import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock child_process
vi.mock('node:child_process', () => ({
    spawn: vi.fn(),
}))

// Mock chalk to avoid colors in tests
vi.mock('chalk')

// Mock spinner — pass through to the callback
vi.mock('../lib/spinner.js', () => ({
    withSpinner: vi.fn((_opts: unknown, fn: () => Promise<unknown>) => fn()),
}))

// Mock config module
vi.mock('../lib/config.js', async (importOriginal) => {
    const original = await importOriginal<typeof import('../lib/config.js')>()
    return {
        ...original,
        readConfig: vi.fn().mockResolvedValue({}),
        writeConfig: vi.fn().mockResolvedValue(undefined),
    }
})

import { spawn } from 'node:child_process'
import { registerUpdateCommand } from '../commands/update/index.js'
import { readConfig, writeConfig } from '../lib/config.js'

const mockSpawn = vi.mocked(spawn)
const mockReadConfig = vi.mocked(readConfig)
const mockWriteConfig = vi.mocked(writeConfig)

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerUpdateCommand(program)
    return program
}

function mockFetch(version: string) {
    vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ version }),
        }),
    )
}

function mockFetchError(status: number) {
    vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
            ok: false,
            status,
        }),
    )
}

function mockFetchNetworkError(message: string) {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(message)))
}

function mockSpawnSuccess() {
    mockSpawn.mockReturnValue({
        stderr: {
            on: vi.fn(),
        },
        on: vi.fn((event: string, cb: (arg?: unknown) => void) => {
            if (event === 'close') cb(0)
        }),
    } as never)
}

function mockSpawnFailure(exitCode: number) {
    mockSpawn.mockReturnValue({
        stderr: {
            on: vi.fn(),
        },
        on: vi.fn((event: string, cb: (arg?: unknown) => void) => {
            if (event === 'close') cb(exitCode)
        }),
    } as never)
}

function mockSpawnPermissionError() {
    mockSpawn.mockReturnValue({
        stderr: {
            on: vi.fn(),
        },
        on: vi.fn((event: string, cb: (arg?: unknown) => void) => {
            if (event === 'error') {
                const err = Object.assign(new Error('EACCES'), { code: 'EACCES' })
                cb(err)
            }
        }),
    } as never)
}

describe('update command', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        process.exitCode = undefined
        mockReadConfig.mockResolvedValue({})
        mockSpawn.mockClear()
        mockWriteConfig.mockClear()
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
        vi.unstubAllEnvs()
        process.exitCode = undefined
    })

    describe('already up to date', () => {
        it('prints up-to-date message when versions match', async () => {
            const {
                default: { version },
            } = await import('../../package.json')
            mockFetch(version)

            const program = createProgram()
            await program.parseAsync(['node', 'td', 'update'])

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.anything(),
                expect.stringContaining('Already up to date'),
            )
            expect(mockSpawn).not.toHaveBeenCalled()
        })
    })

    describe('--check flag', () => {
        it('shows version info without installing when update available', async () => {
            mockFetch('99.99.99')

            const program = createProgram()
            await program.parseAsync(['node', 'td', 'update', '--check'])

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Update available'))
            expect(mockSpawn).not.toHaveBeenCalled()
        })

        it('shows up-to-date message when already current', async () => {
            const {
                default: { version },
            } = await import('../../package.json')
            mockFetch(version)

            const program = createProgram()
            await program.parseAsync(['node', 'td', 'update', '--check'])

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.anything(),
                expect.stringContaining('Already up to date'),
            )
        })

        it('shows channel info', async () => {
            mockFetch('99.99.99')

            const program = createProgram()
            await program.parseAsync(['node', 'td', 'update', '--check'])

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Channel:'))
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('stable'))
        })

        it('shows pre-release channel when configured', async () => {
            mockReadConfig.mockResolvedValue({ update_channel: 'pre-release' })
            mockFetch('1.36.0-next.1')

            const program = createProgram()
            await program.parseAsync(['node', 'td', 'update', '--check'])

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Channel:'))
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('pre-release'))
        })
    })

    describe('update available', () => {
        it('spawns npm install and reports success', async () => {
            mockFetch('99.99.99')
            mockSpawnSuccess()

            const program = createProgram()
            await program.parseAsync(['node', 'td', 'update'])

            expect(mockSpawn).toHaveBeenCalledWith(
                'npm',
                ['install', '-g', '@doist/todoist-cli@latest'],
                { stdio: 'pipe' },
            )
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.anything(),
                expect.stringContaining('Updated to v99.99.99'),
            )
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.anything(),
                expect.stringContaining('td changelog'),
                expect.anything(),
            )
        })

        it('uses pnpm add when pnpm is detected', async () => {
            mockFetch('99.99.99')
            mockSpawnSuccess()
            vi.stubEnv('npm_execpath', '/usr/local/lib/node_modules/pnpm/bin/pnpm.cjs')

            const program = createProgram()
            await program.parseAsync(['node', 'td', 'update'])

            expect(mockSpawn).toHaveBeenCalledWith(
                'pnpm',
                ['add', '-g', '@doist/todoist-cli@latest'],
                { stdio: 'pipe' },
            )
        })
    })

    describe('registry errors', () => {
        it('handles HTTP errors from registry', async () => {
            mockFetchError(503)

            const program = createProgram()
            await program.parseAsync(['node', 'td', 'update'])

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.anything(),
                expect.stringContaining('Failed to check for updates'),
            )
            expect(process.exitCode).toBe(1)
        })

        it('handles network failures', async () => {
            mockFetchNetworkError('getaddrinfo ENOTFOUND registry.npmjs.org')

            const program = createProgram()
            await program.parseAsync(['node', 'td', 'update'])

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.anything(),
                expect.stringContaining('Failed to check for updates'),
            )
            expect(process.exitCode).toBe(1)
        })
    })

    describe('install errors', () => {
        it('suggests sudo on permission error', async () => {
            mockFetch('99.99.99')
            mockSpawnPermissionError()

            const program = createProgram()
            await program.parseAsync(['node', 'td', 'update'])

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.anything(),
                expect.stringContaining('Permission denied'),
            )
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('sudo'))
            expect(process.exitCode).toBe(1)
        })

        it('handles non-zero exit code from npm', async () => {
            mockFetch('99.99.99')
            mockSpawnFailure(1)

            const program = createProgram()
            await program.parseAsync(['node', 'td', 'update'])

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.anything(),
                expect.stringContaining('exited with code 1'),
            )
            expect(process.exitCode).toBe(1)
        })
    })

    describe('pre-release channel', () => {
        beforeEach(() => {
            mockReadConfig.mockResolvedValue({ update_channel: 'pre-release' })
        })

        it('fetches from next registry URL', async () => {
            mockFetch('1.36.0-next.1')
            mockSpawnSuccess()

            const program = createProgram()
            await program.parseAsync(['node', 'td', 'update'])

            expect(fetch).toHaveBeenCalledWith('https://registry.npmjs.org/@doist/todoist-cli/next')
        })

        it('installs with @next tag', async () => {
            mockFetch('1.36.0-next.1')
            mockSpawnSuccess()

            const program = createProgram()
            await program.parseAsync(['node', 'td', 'update'])

            expect(mockSpawn).toHaveBeenCalledWith(
                'npm',
                ['install', '-g', '@doist/todoist-cli@next'],
                { stdio: 'pipe' },
            )
        })

        it('does not suggest td changelog after pre-release update', async () => {
            mockFetch('1.36.0-next.1')
            mockSpawnSuccess()

            const program = createProgram()
            await program.parseAsync(['node', 'td', 'update'])

            expect(consoleSpy).not.toHaveBeenCalledWith(
                expect.anything(),
                expect.stringContaining('td changelog'),
                expect.anything(),
            )
        })

        it('--check respects pre-release channel', async () => {
            mockFetch('1.36.0-next.1')

            const program = createProgram()
            await program.parseAsync(['node', 'td', 'update', '--check'])

            expect(fetch).toHaveBeenCalledWith('https://registry.npmjs.org/@doist/todoist-cli/next')
            expect(mockSpawn).not.toHaveBeenCalled()
        })

        it('treats next.10 as newer than next.2 (multi-digit prerelease)', async () => {
            mockFetch('1.37.0-next.10')
            mockSpawnSuccess()

            const program = createProgram()
            await program.parseAsync(['node', 'td', 'update'])

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Update available'))
            expect(mockSpawn).toHaveBeenCalled()
        })

        it('warns but still installs when channel tag resolves to older version', async () => {
            // Simulate: user on stable 1.35.1, pre-release is 1.35.1-next.1
            // Pre-release of same core version is older per semver
            mockFetch('1.35.1-next.1')
            mockSpawnSuccess()

            const program = createProgram()
            await program.parseAsync(['node', 'td', 'update'])

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Downgrade available'))
            expect(mockSpawn).toHaveBeenCalledWith(
                'npm',
                ['install', '-g', '@doist/todoist-cli@next'],
                { stdio: 'pipe' },
            )
        })
    })

    describe('switch subcommand', () => {
        it('sets channel to stable', async () => {
            mockReadConfig.mockResolvedValue({ update_channel: 'pre-release' })

            const program = createProgram()
            await program.parseAsync(['node', 'td', 'update', 'switch', '--stable'])

            expect(mockWriteConfig).toHaveBeenCalledWith({
                update_channel: 'stable',
            })
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.anything(),
                expect.stringContaining('stable'),
            )
        })

        it('sets channel to pre-release with warning', async () => {
            const program = createProgram()
            await program.parseAsync(['node', 'td', 'update', 'switch', '--pre-release'])

            expect(mockWriteConfig).toHaveBeenCalledWith({
                update_channel: 'pre-release',
            })
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.anything(),
                expect.stringContaining('pre-release'),
            )
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Remember to switch back'),
            )
        })

        it('preserves existing config keys', async () => {
            mockReadConfig.mockResolvedValue({
                auth_mode: 'read-write',
                auth_scope: 'data:read_write',
            })

            const program = createProgram()
            await program.parseAsync(['node', 'td', 'update', 'switch', '--stable'])

            expect(mockWriteConfig).toHaveBeenCalledWith({
                auth_mode: 'read-write',
                auth_scope: 'data:read_write',
                update_channel: 'stable',
            })
        })

        it('errors when both flags provided', async () => {
            const program = createProgram()
            await program.parseAsync([
                'node',
                'td',
                'update',
                'switch',
                '--stable',
                '--pre-release',
            ])

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.anything(),
                expect.stringContaining('not both'),
            )
            expect(process.exitCode).toBe(1)
        })

        it('errors when no flag provided', async () => {
            const program = createProgram()
            await program.parseAsync(['node', 'td', 'update', 'switch'])

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.anything(),
                expect.stringContaining('--stable or --pre-release'),
            )
            expect(process.exitCode).toBe(1)
        })
    })

    describe('--channel flag', () => {
        it('shows stable when no config set', async () => {
            const program = createProgram()
            await program.parseAsync(['node', 'td', 'update', '--channel'])

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('stable'))
            expect(mockSpawn).not.toHaveBeenCalled()
        })

        it('shows pre-release when configured', async () => {
            mockReadConfig.mockResolvedValue({ update_channel: 'pre-release' })

            const program = createProgram()
            await program.parseAsync(['node', 'td', 'update', '--channel'])

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('pre-release'))
            expect(mockSpawn).not.toHaveBeenCalled()
        })

        it('does not fetch from registry', async () => {
            const fetchSpy = vi.fn()
            vi.stubGlobal('fetch', fetchSpy)

            const program = createProgram()
            await program.parseAsync(['node', 'td', 'update', '--channel'])

            expect(fetchSpy).not.toHaveBeenCalled()
        })

        it('errors when combined with --check', async () => {
            const program = createProgram()
            await program.parseAsync(['node', 'td', 'update', '--check', '--channel'])

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.anything(),
                expect.stringContaining('not both'),
            )
            expect(process.exitCode).toBe(1)
        })
    })
})
