import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/config.js', () => ({
    CONFIG_PATH: '/tmp/fake-todoist-cli/config.json',
    readConfigStrict: vi.fn(),
    readConfig: vi.fn().mockResolvedValue({}),
}))

vi.mock('../../lib/auth.js', async () => {
    const actual = await vi.importActual<typeof import('../../lib/auth.js')>('../../lib/auth.js')
    return {
        ...actual,
        probeApiToken: vi.fn(),
        listStoredUsers: vi.fn().mockResolvedValue([]),
    }
})

vi.mock('chalk')

import { listStoredUsers, NoTokenError, probeApiToken } from '../../lib/auth.js'
import { type Config, readConfigStrict } from '../../lib/config.js'
import { CliError } from '../../lib/errors.js'
import { SecureStoreUnavailableError } from '../../lib/secure-store.js'
import { registerConfigCommand } from './index.js'

const mockReadConfigStrict = vi.mocked(readConfigStrict)
const mockProbeApiToken = vi.mocked(probeApiToken)
const mockListStoredUsers = vi.mocked(listStoredUsers)

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

function presentConfig(config: Config = fullConfig) {
    mockReadConfigStrict.mockResolvedValue({ state: 'present', config })
}

function missingConfig() {
    mockReadConfigStrict.mockResolvedValue({ state: 'missing' })
}

function mockToken(
    source: 'env' | 'secure-store' | 'config-file',
    overrides: Partial<{
        token: string
        authMode: 'read-only' | 'read-write' | 'unknown'
        authScope?: string
        authFlags?: ('read-only' | 'app-management' | 'backups')[]
    }> = {},
) {
    mockProbeApiToken.mockResolvedValue({
        token: overrides.token ?? fullConfig.api_token!,
        metadata: {
            authMode: overrides.authMode ?? 'read-write',
            authScope: overrides.authScope,
            authFlags: overrides.authFlags,
            source,
        },
    })
}

describe('config view', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('prints a pretty layout with the token masked by default', async () => {
        presentConfig()
        mockToken('config-file', {
            authScope: 'data:read,data:delete',
            authFlags: ['app-management'],
        })
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
        presentConfig({ auth_mode: 'read-write' })
        mockToken('secure-store', { token: 'tdo_keychainXXXXXXXX1234' })
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await createProgram().parseAsync(['node', 'td', 'config', 'view'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('****…1234')
        expect(output).toContain('system credential manager')
        expect(output).not.toContain('plaintext')

        consoleSpy.mockRestore()
    })

    it('labels env-sourced tokens and shows active mode, not stale config values', async () => {
        // Config has a stale read-only entry from a previous `td auth login`,
        // but TODOIST_API_TOKEN is now driving auth with an unknown scope.
        presentConfig({
            auth_mode: 'read-only',
            auth_scope: 'data:read',
            auth_flags: ['read-only'],
        })
        mockToken('env', { token: 'tdo_envXXXXXXXX5678', authMode: 'unknown' })
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await createProgram().parseAsync(['node', 'td', 'config', 'view'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('****…5678')
        expect(output).toContain('TODOIST_API_TOKEN')
        // Active mode is unknown (env scope isn't introspectable), not read-only.
        expect(output).toContain('Mode:          unknown')
        expect(output).not.toContain('data:read')
        expect(output).not.toMatch(/Flags:\s+read-only/)

        consoleSpy.mockRestore()
    })

    it('degrades gracefully when the credential manager is unavailable', async () => {
        presentConfig({ auth_mode: 'read-write', update_channel: 'stable' })
        mockProbeApiToken.mockRejectedValue(new SecureStoreUnavailableError('macOS Keychain error'))
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await createProgram().parseAsync(['node', 'td', 'config', 'view'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('unknown')
        expect(output).toContain('system credential manager unavailable')
        expect(output).toContain('stable')

        consoleSpy.mockRestore()
    })

    it('--json emits the raw config with api_token masked', async () => {
        presentConfig()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await createProgram().parseAsync(['node', 'td', 'config', 'view', '--json'])

        const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string)
        expect(parsed.api_token).toBe('****…7890')
        expect(parsed.auth_mode).toBe('read-write')
        expect(parsed.hc).toEqual({ defaultLocale: 'en-us' })

        consoleSpy.mockRestore()
    })

    it('--show-token reveals the full token in both views', async () => {
        presentConfig()
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

    it('handles a missing config file gracefully', async () => {
        missingConfig()
        mockProbeApiToken.mockRejectedValue(new NoTokenError())
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await createProgram().parseAsync(['node', 'td', 'config', 'view'])
        expect(consoleSpy.mock.calls[0][0]).toContain('not created yet')

        consoleSpy.mockClear()
        await createProgram().parseAsync(['node', 'td', 'config', 'view', '--json'])
        expect(consoleSpy.mock.calls[0][0]).toBe('{}')

        consoleSpy.mockRestore()
    })

    it('surfaces malformed-config errors instead of silently pretending it is empty', async () => {
        mockReadConfigStrict.mockRejectedValue(
            new CliError(
                'CONFIG_INVALID_JSON',
                'Config file at /tmp/fake-todoist-cli/config.json is not valid JSON: Unexpected token',
                ['Fix the JSON'],
            ),
        )
        mockProbeApiToken.mockRejectedValue(new NoTokenError())

        await expect(
            createProgram().parseAsync(['node', 'td', 'config', 'view']),
        ).rejects.toMatchObject({ code: 'CONFIG_INVALID_JSON' })
    })

    it('shows "not set" when no token can be found anywhere', async () => {
        presentConfig({ update_channel: 'stable' })
        mockProbeApiToken.mockRejectedValue(new NoTokenError())
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await createProgram().parseAsync(['node', 'td', 'config', 'view'])
        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('not set')
        expect(output).toContain('stable')

        consoleSpy.mockRestore()
    })

    it('masks very short tokens without exposing characters', async () => {
        presentConfig({ api_token: 'abcd' })
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await createProgram().parseAsync(['node', 'td', 'config', 'view', '--json'])
        const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string)
        expect(parsed.api_token).toBe('****')
        expect(parsed.api_token).not.toContain('abcd')

        consoleSpy.mockRestore()
    })

    it('lists stored accounts and marks the default in pretty mode', async () => {
        presentConfig({
            config_version: 2,
            user: { defaultUser: '111' },
            users: [
                { id: '111', email: 'first@example.com', auth_mode: 'read-write' },
                {
                    id: '222',
                    email: 'second@example.com',
                    auth_mode: 'read-only',
                    auth_scope: 'data:read',
                },
            ],
        })
        mockListStoredUsers.mockResolvedValue([
            { id: '111', email: 'first@example.com', auth_mode: 'read-write' },
            {
                id: '222',
                email: 'second@example.com',
                auth_mode: 'read-only',
                auth_scope: 'data:read',
            },
        ])
        mockProbeApiToken.mockResolvedValue({
            token: 'tdo_first_token_xxxx1111',
            metadata: {
                authMode: 'read-write',
                source: 'secure-store',
                userId: '111',
                email: 'first@example.com',
            },
        })
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await createProgram().parseAsync(['node', 'td', 'config', 'view'])
        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')

        expect(output).toContain('Stored accounts (2)')
        expect(output).toContain('first@example.com')
        expect(output).toContain('second@example.com')
        expect(output).toContain('(default)')
        expect(output).toContain('Active:        first@example.com')
        expect(output).toContain('read-only (data:read)')

        consoleSpy.mockRestore()
    })

    it('flags ambiguous resolution when multiple users with no default', async () => {
        presentConfig({
            config_version: 2,
            users: [
                { id: '111', email: 'a@b.c' },
                { id: '222', email: 'd@e.f' },
            ],
        })
        mockListStoredUsers.mockResolvedValue([
            { id: '111', email: 'a@b.c' },
            { id: '222', email: 'd@e.f' },
        ])
        const { NoUserSelectedError } = await import('../../lib/users.js')
        mockProbeApiToken.mockRejectedValue(new NoUserSelectedError())
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await createProgram().parseAsync(['node', 'td', 'config', 'view'])
        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')

        expect(output).toContain('multiple stored accounts')
        expect(output).toContain('--user')
        expect(output).toContain('Stored accounts (2)')

        consoleSpy.mockRestore()
    })

    it('--json masks per-user api_token entries', async () => {
        presentConfig({
            config_version: 2,
            users: [
                {
                    id: '111',
                    email: 'a@b.c',
                    api_token: 'tdo_plaintext_user_token_xxxx',
                },
            ],
        })
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await createProgram().parseAsync(['node', 'td', 'config', 'view', '--json'])
        const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string)
        expect(parsed.users[0].api_token).toBe('****…xxxx')
        expect(parsed.users[0].api_token).not.toContain('plaintext')

        consoleSpy.mockRestore()
    })
})
