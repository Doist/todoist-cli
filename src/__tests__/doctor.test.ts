import { readFile } from 'node:fs/promises'
import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('chalk')

vi.mock('node:fs/promises', () => ({
    readFile: vi.fn(),
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
        getApiToken: vi.fn(),
        getAuthMetadata: vi.fn(),
    }
})

vi.mock('../lib/api/core.js', () => ({
    getApi: vi.fn(),
}))

vi.mock('../lib/config.js', async (importOriginal) => {
    const original = await importOriginal<typeof import('../lib/config.js')>()
    return {
        ...original,
        readConfig: vi.fn().mockResolvedValue({}),
    }
})

import { registerDoctorCommand } from '../commands/doctor.js'
import { getApi } from '../lib/api/core.js'
import { NoTokenError, getApiToken, getAuthMetadata } from '../lib/auth.js'
import { readConfig } from '../lib/config.js'

const mockReadFile = vi.mocked(readFile)
const mockGetApi = vi.mocked(getApi)
const mockGetApiToken = vi.mocked(getApiToken)
const mockGetAuthMetadata = vi.mocked(getAuthMetadata)
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

        mockReadFile.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }))
        mockReadConfig.mockResolvedValue({})
        mockGetApiToken.mockResolvedValue('test_token_123456789')
        mockGetAuthMetadata.mockResolvedValue({ authMode: 'read-write', source: 'secure-store' })
        mockGetApi.mockResolvedValue({
            getUser: vi.fn().mockResolvedValue({
                id: 'user-1',
                email: 'person@example.com',
                fullName: 'Example Person',
            }),
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

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('PASS Node.js v20.18.1'))
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('PASS Authenticated as person@example.com via secure-store'),
        )
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('PASS CLI is up to date on stable (v1.0.0)'),
        )
        expect(process.exitCode).toBeUndefined()
    })

    it('warns when plaintext config fallback is in use and an update is available', async () => {
        mockReadFile.mockResolvedValue(
            JSON.stringify({
                api_token: 'plaintext-token',
                update_channel: 'pre-release',
            }),
        )
        mockReadConfig.mockResolvedValue({ update_channel: 'pre-release' })
        mockGetAuthMetadata.mockResolvedValue({ authMode: 'read-write', source: 'config-file' })
        mockFetch('2.0.0')

        const program = createProgram()
        await program.parseAsync(['node', 'td', 'doctor'])

        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining(
                'WARN Config file is readable but contains a plaintext API token fallback',
            ),
        )
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining(
                'WARN Authenticated as person@example.com, but token is stored in plaintext config fallback',
            ),
        )
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('WARN Update available on pre-release: v1.0.0 -> v2.0.0'),
        )
        expect(process.exitCode).toBeUndefined()
    })

    it('supports json output and offline mode', async () => {
        mockGetApiToken.mockRejectedValue(new NoTokenError())

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
        expect(parsed.summary.skipped).toBe(1)
        expect(parsed.checks).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: 'auth', status: 'warn' }),
                expect.objectContaining({ name: 'update', status: 'skip' }),
            ]),
        )
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
