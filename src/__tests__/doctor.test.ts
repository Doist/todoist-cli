import { readFile } from 'node:fs/promises'
import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockWithSpinner, mockProgressTracker } = vi.hoisted(() => ({
    mockWithSpinner: vi.fn((_opts: unknown, fn: () => Promise<unknown>) => fn()),
    mockProgressTracker: {
        isEnabled: vi.fn(() => true),
        emitApiCall: vi.fn(),
        emitApiResponse: vi.fn(),
        emitError: vi.fn(),
    },
}))

vi.mock('chalk')

vi.mock('@doist/todoist-sdk', () => ({
    TodoistApi: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
    readFile: vi.fn(),
}))

vi.mock('../lib/progress.js', () => ({
    getProgressTracker: vi.fn(() => mockProgressTracker),
}))

vi.mock('../lib/spinner.js', () => ({
    withSpinner: mockWithSpinner,
}))

vi.mock('../../package.json', () => ({
    default: {
        version: '1.0.0',
        engines: {
            node: '>=20.18.1',
        },
    },
}))

vi.mock('../lib/auth.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../lib/auth.js')>()
    return {
        ...actual,
        CONFIG_PATH: '/tmp/test-config.json',
        probeApiToken: vi.fn(),
    }
})

vi.mock('../lib/config.js', async (importOriginal) => {
    const original = await importOriginal<typeof import('../lib/config.js')>()
    return {
        ...original,
        readConfig: vi.fn().mockResolvedValue({}),
    }
})

import { TodoistApi } from '@doist/todoist-sdk'
import { registerDoctorCommand } from '../commands/doctor.js'
import { NoTokenError, probeApiToken } from '../lib/auth.js'
import { readConfig } from '../lib/config.js'

const mockReadFile = vi.mocked(readFile)
const mockTodoistApi = vi.mocked(TodoistApi)
const mockProbeApiToken = vi.mocked(probeApiToken)
const mockReadConfig = vi.mocked(readConfig)

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerDoctorCommand(program)
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

describe('doctor command', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>
    let originalProcessVersion: PropertyDescriptor | undefined

    beforeEach(() => {
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.clearAllMocks()
        vi.unstubAllGlobals()
        process.exitCode = undefined
        mockWithSpinner.mockImplementation((_opts: unknown, fn: () => Promise<unknown>) => fn())
        mockProgressTracker.isEnabled.mockReturnValue(true)

        mockReadFile.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }))
        mockReadConfig.mockResolvedValue({})
        mockProbeApiToken.mockResolvedValue({
            token: 'test_token_123456789',
            metadata: { authMode: 'read-write', source: 'secure-store' },
        })
        mockTodoistApi.mockImplementation(function () {
            return {
                getUser: vi.fn().mockResolvedValue({
                    id: 'user-1',
                    email: 'person@example.com',
                    fullName: 'Example Person',
                }),
            } as never
        } as never)

        originalProcessVersion = Object.getOwnPropertyDescriptor(process, 'version')
        Object.defineProperty(process, 'version', {
            configurable: true,
            value: 'v20.18.1',
        })
    })

    afterEach(() => {
        consoleSpy.mockRestore()
        process.exitCode = undefined
        if (originalProcessVersion) {
            Object.defineProperty(process, 'version', originalProcessVersion)
        }
    })

    it('reports a healthy setup', async () => {
        mockFetch('1.0.0')

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'doctor'])

        expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Node.js v20.18.1'))
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('PASS Authenticated as person@example.com via secure-store'),
        )
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('PASS CLI is up to date on stable (v1.0.0)'),
        )
        expect(mockWithSpinner).toHaveBeenCalledWith(
            expect.objectContaining({ text: 'Checking authentication...', color: 'blue' }),
            expect.any(Function),
        )
        expect(mockWithSpinner).toHaveBeenCalledWith(
            expect.objectContaining({ text: 'Checking for updates...', color: 'blue' }),
            expect.any(Function),
        )
        expect(consoleSpy).toHaveBeenCalledWith('Doctor summary: 2 passed')
        expect(process.exitCode).toBeUndefined()
    })

    it('emits shared API progress events for auth validation when tracking is enabled', async () => {
        mockFetch('1.0.0')

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'doctor'])

        expect(mockProgressTracker.emitApiCall).toHaveBeenCalledWith('getUser', null)
        expect(mockProgressTracker.emitApiResponse).toHaveBeenCalledWith(1, false, null)
        expect(mockProgressTracker.emitError).not.toHaveBeenCalled()
    })

    it('warns when plaintext config fallback is in use and an update is available', async () => {
        mockReadFile.mockResolvedValue(
            JSON.stringify({
                api_token: 'plaintext-token',
                update_channel: 'pre-release',
            }),
        )
        mockReadConfig.mockResolvedValue({ update_channel: 'pre-release' })
        mockProbeApiToken.mockResolvedValue({
            token: 'plaintext-token',
            metadata: { authMode: 'read-write', source: 'config-file' },
        })
        mockFetch('2.0.0')

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'doctor'])

        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining(
                'WARN Authenticated as person@example.com, but token is stored in plaintext config fallback',
            ),
        )
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('PASS Config file is readable (/tmp/test-config.json)'),
        )
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('WARN Update available on pre-release: v1.0.0 -> v2.0.0'),
        )
        expect(consoleSpy).toHaveBeenCalledWith('Doctor summary: 1 passed, 2 warnings')
        expect(process.exitCode).toBeUndefined()
    })

    it('warns when config fields are invalid or unrecognized', async () => {
        mockReadFile.mockResolvedValue(
            JSON.stringify({
                pendingSecureStoreClear: 'yes',
                auth_mode: 'admin',
                update_channel: 'beta',
                extra_setting: true,
            }),
        )
        mockFetch('1.0.0')

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'doctor'])

        const configWarning = consoleSpy.mock.calls.find(
            (call: unknown[]) =>
                typeof call[0] === 'string' &&
                (call[0] as string).includes('WARN Config file is readable but'),
        )?.[0]

        expect(configWarning).toEqual(expect.any(String))
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('WARN Config file is readable but'),
        )
        expect(configWarning).toContain('contains unrecognized key "extra_setting"')
        expect(configWarning).toContain('pendingSecureStoreClear must be a boolean')
        expect(configWarning).toContain('auth_mode must be one of: read-only, read-write, unknown')
        expect(configWarning).toContain('update_channel must be one of: stable, pre-release')
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('PASS Authenticated as person@example.com via secure-store'),
        )
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('PASS CLI is up to date on stable (v1.0.0)'),
        )
        expect(consoleSpy).toHaveBeenCalledWith('Doctor summary: 2 passed, 1 warnings')
        expect(process.exitCode).toBeUndefined()
    })

    it('supports json output and offline mode', async () => {
        mockProbeApiToken.mockRejectedValue(new NoTokenError())

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'doctor', '--json', '--offline'])

        const output = consoleSpy.mock.calls.at(-1)?.[0]
        expect(typeof output).toBe('string')

        const parsed = JSON.parse(output as string) as {
            ok: boolean
            summary: { passed: number; warned: number; failed: number; skipped: number }
            checks: Array<{ name: string; status: string }>
        }

        expect(parsed.ok).toBe(true)
        expect(parsed.summary.passed).toBe(0)
        expect(parsed.summary.skipped).toBe(1)
        expect(parsed.checks).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: 'auth', status: 'warn' }),
                expect.objectContaining({ name: 'update', status: 'skip' }),
            ]),
        )
    })

    it('marks secure-store auth as skipped in offline mode', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'td', 'doctor', '--offline'])

        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining(
                'SKIP Auth validation skipped (--offline); credentials found via secure-store',
            ),
        )
        expect(consoleSpy).toHaveBeenCalledWith('Doctor summary: 0 passed, 2 skipped')
    })

    it('does not instantiate the API client in offline mode', async () => {
        const program = createProgram()
        await program.parseAsync(['node', 'td', 'doctor', '--offline'])

        expect(mockTodoistApi).not.toHaveBeenCalled()
    })

    it('fails when node or config are invalid', async () => {
        Object.defineProperty(process, 'version', {
            configurable: true,
            value: 'v18.0.0',
        })
        mockReadFile.mockResolvedValue('{')
        mockFetch('1.0.0')

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'doctor'])

        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('FAIL Node.js v18.0.0 does not satisfy >=20.18.1'),
        )
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('FAIL Could not read config file /tmp/test-config.json'),
        )
        expect(process.exitCode).toBe(1)
    })
})
