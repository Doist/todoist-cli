import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/config.js', () => ({
    CONFIG_PATH: '/tmp/fake-todoist-cli/config.json',
    readConfig: vi.fn(),
}))

vi.mock('../../lib/auth.js', async () => {
    const actual = await vi.importActual<typeof import('../../lib/auth.js')>('../../lib/auth.js')
    return {
        ...actual,
        probeApiToken: vi.fn(),
    }
})

vi.mock('chalk')

import { NoTokenError, probeApiToken } from '../../lib/auth.js'
import { type Config, readConfig } from '../../lib/config.js'
import { registerConfigCommand } from './index.js'

const mockReadConfig = vi.mocked(readConfig)
const mockProbeApiToken = vi.mocked(probeApiToken)

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerConfigCommand(program)
    return program
}

const fullConfig: Config = {
    api_token: 'tdo_abcdefghij1234567890',
    auth_mode: 'read-write',
    auth_scope: 'data:read,data:delete',
    auth_flags: ['app-management'],
    update_channel: 'stable',
    hc: { defaultLocale: 'en-us' },
}

function mockToken(source: 'env' | 'secure-store' | 'config-file', token = fullConfig.api_token!) {
    mockProbeApiToken.mockResolvedValue({
        token,
        metadata: { authMode: 'read-write', source },
    })
}

describe('config view', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('prints a pretty layout with the token masked by default', async () => {
        mockReadConfig.mockResolvedValue(fullConfig)
        mockToken('config-file')
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await createProgram().parseAsync(['node', 'td', 'config', 'view'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('/tmp/fake-todoist-cli/config.json')
        expect(output).toContain('Authentication')
        expect(output).toContain('Updates')
        expect(output).toContain('Help Center')
        expect(output).toContain('****…7890')
        expect(output).not.toContain('tdo_abcdefghij1234567890')
        expect(output).toContain('config file (plaintext fallback)')
        expect(output).toContain('read-write')
        expect(output).toContain('en-us')

        consoleSpy.mockRestore()
    })

    it('labels tokens stored in the system credential manager', async () => {
        mockReadConfig.mockResolvedValue({ auth_mode: 'read-write' })
        mockToken('secure-store', 'tdo_keychainXXXXXXXX1234')
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await createProgram().parseAsync(['node', 'td', 'config', 'view'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('****…1234')
        expect(output).toContain('system credential manager')
        expect(output).not.toContain('plaintext')

        consoleSpy.mockRestore()
    })

    it('labels tokens coming from the environment variable', async () => {
        mockReadConfig.mockResolvedValue({})
        mockToken('env', 'tdo_envXXXXXXXX5678')
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await createProgram().parseAsync(['node', 'td', 'config', 'view'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('****…5678')
        expect(output).toContain('TODOIST_API_TOKEN')

        consoleSpy.mockRestore()
    })

    it('--json emits the raw config with api_token masked', async () => {
        mockReadConfig.mockResolvedValue(fullConfig)
        mockToken('config-file')
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await createProgram().parseAsync(['node', 'td', 'config', 'view', '--json'])

        const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string)
        expect(parsed.api_token).toBe('****…7890')
        expect(parsed.auth_mode).toBe('read-write')
        expect(parsed.hc).toEqual({ defaultLocale: 'en-us' })

        consoleSpy.mockRestore()
    })

    it('--show-token reveals the full token in both views', async () => {
        mockReadConfig.mockResolvedValue(fullConfig)
        mockToken('config-file')
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await createProgram().parseAsync(['node', 'td', 'config', 'view', '--show-token'])
        const pretty = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(pretty).toContain('tdo_abcdefghij1234567890')

        consoleSpy.mockClear()
        await createProgram().parseAsync(['node', 'td', 'config', 'view', '--json', '--show-token'])
        const json = JSON.parse(consoleSpy.mock.calls[0][0] as string)
        expect(json.api_token).toBe('tdo_abcdefghij1234567890')

        consoleSpy.mockRestore()
    })

    it('handles a missing / empty config gracefully', async () => {
        mockReadConfig.mockResolvedValue({})
        mockProbeApiToken.mockRejectedValue(new NoTokenError())
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await createProgram().parseAsync(['node', 'td', 'config', 'view'])
        expect(consoleSpy.mock.calls[0][0]).toContain('not created yet')

        consoleSpy.mockClear()
        await createProgram().parseAsync(['node', 'td', 'config', 'view', '--json'])
        expect(consoleSpy.mock.calls[0][0]).toBe('{}')

        consoleSpy.mockRestore()
    })

    it('shows "not set" when no token can be found anywhere', async () => {
        mockReadConfig.mockResolvedValue({ update_channel: 'stable' })
        mockProbeApiToken.mockRejectedValue(new NoTokenError())
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await createProgram().parseAsync(['node', 'td', 'config', 'view'])
        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('not set')
        expect(output).toContain('stable')

        consoleSpy.mockRestore()
    })

    it('masks very short tokens without exposing characters', async () => {
        mockReadConfig.mockResolvedValue({ api_token: 'abcd' })
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await createProgram().parseAsync(['node', 'td', 'config', 'view', '--json'])
        const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string)
        expect(parsed.api_token).toBe('****')
        expect(parsed.api_token).not.toContain('abcd')

        consoleSpy.mockRestore()
    })
})
