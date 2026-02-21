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

import { spawn } from 'node:child_process'
import { registerUpdateCommand } from '../commands/update.js'

const mockSpawn = vi.mocked(spawn)

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
        on: vi.fn((event: string, cb: (arg?: unknown) => void) => {
            if (event === 'close') cb(0)
        }),
    } as never)
}

function mockSpawnFailure(exitCode: number) {
    mockSpawn.mockReturnValue({
        on: vi.fn((event: string, cb: (arg?: unknown) => void) => {
            if (event === 'close') cb(exitCode)
        }),
    } as never)
}

function mockSpawnPermissionError() {
    mockSpawn.mockReturnValue({
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
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
        vi.unstubAllEnvs()
        process.exitCode = undefined
    })

    describe('already up to date', () => {
        it('prints up-to-date message when versions match', async () => {
            const { version } = await import('../../package.json')
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
            const { version } = await import('../../package.json')
            mockFetch(version)

            const program = createProgram()
            await program.parseAsync(['node', 'td', 'update', '--check'])

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.anything(),
                expect.stringContaining('Already up to date'),
            )
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
                { stdio: 'inherit' },
            )
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.anything(),
                expect.stringContaining('Updated to v99.99.99'),
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
                { stdio: 'inherit' },
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
})
