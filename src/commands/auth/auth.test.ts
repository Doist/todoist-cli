import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the auth module
vi.mock('../../lib/auth.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../lib/auth.js')>()
    return {
        ...actual,
        upsertUser: vi.fn(),
        clearApiToken: vi.fn(),
        getAuthMetadata: vi.fn(),
        listStoredUsers: vi.fn(),
        readConfig: vi.fn(),
        resolveActiveUser: vi.fn(),
    }
})

// Mock the api module
vi.mock('../../lib/api/core.js', () => ({
    getApi: vi.fn(),
    createApiForToken: vi.fn(),
}))

// Mock chalk to avoid colors in tests
vi.mock('chalk')

// Mock cli-core's login registrar so the login subcommand never actually
// drives the OAuth flow. The original todoist-local OAuth tests were dropped
// when `pkce` / `oauth` / `oauth-server` moved to cli-core; cli-core has its
// own runtime + registrar tests.
vi.mock('@doist/cli-core/auth', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@doist/cli-core/auth')>()
    return {
        ...actual,
        attachLoginCommand: vi.fn((parent: { command: (name: string) => unknown }) =>
            parent.command('login'),
        ),
    }
})

// Mock readline for interactive token input
vi.mock('node:readline', () => ({
    createInterface: vi.fn(() => {
        const rl = {
            question: vi.fn(),
            close: vi.fn(),
        }
        return rl
    }),
}))

import { createInterface, type Interface } from 'node:readline'
import { createApiForToken, getApi } from '../../lib/api/core.js'
import {
    NoTokenError,
    TOKEN_ENV_VAR,
    clearApiToken,
    getAuthMetadata,
    listStoredUsers,
    readConfig,
    resolveActiveUser,
    upsertUser,
} from '../../lib/auth.js'
import { resetGlobalArgs } from '../../lib/global-args.js'
import { UserNotFoundError } from '../../lib/users.js'
import { createMockApi } from '../../test-support/mock-api.js'
import { registerAuthCommand } from './index.js'

const mockCreateInterface = vi.mocked(createInterface)

const mockUpsertUser = vi.mocked(upsertUser)
const mockClearApiToken = vi.mocked(clearApiToken)
const mockGetAuthMetadata = vi.mocked(getAuthMetadata)
const mockListStoredUsers = vi.mocked(listStoredUsers)
const mockReadConfig = vi.mocked(readConfig)
const mockResolveActiveUser = vi.mocked(resolveActiveUser)
const mockGetApi = vi.mocked(getApi)
const mockCreateApiForToken = vi.mocked(createApiForToken)

const TEST_USER = {
    id: '12345',
    email: 'test@example.com',
    fullName: 'Test User',
}

function stubProbeApiForUser(user = TEST_USER) {
    const probe = createMockApi({ getUser: vi.fn().mockResolvedValue(user) })
    mockCreateApiForToken.mockReturnValue(probe)
    return probe
}

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerAuthCommand(program)
    return program
}

describe('auth command', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>
    let errorSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        mockListStoredUsers.mockResolvedValue([])
        mockReadConfig.mockResolvedValue({})
    })

    afterEach(() => {
        consoleSpy.mockRestore()
        errorSpy.mockRestore()
        process.exitCode = undefined
    })

    describe('token subcommand', () => {
        it('successfully saves a token', async () => {
            const program = createProgram()
            const token = 'some_token_123456789'

            stubProbeApiForUser()
            mockUpsertUser.mockResolvedValue({ storage: 'secure-store', replaced: false })

            await program.parseAsync(['node', 'td', 'auth', 'token', token])

            expect(mockCreateApiForToken).toHaveBeenCalledWith(token)
            expect(mockUpsertUser).toHaveBeenCalledWith({
                id: TEST_USER.id,
                email: TEST_USER.email,
                token,
                authMode: 'unknown',
            })
            expect(consoleSpy).toHaveBeenCalledWith('✓', `Saved token for ${TEST_USER.email}`)
        })

        it('handles upsertUser errors', async () => {
            const program = createProgram()
            const token = 'some_token_123456789'

            stubProbeApiForUser()
            mockUpsertUser.mockRejectedValue(new Error('Permission denied'))

            await expect(
                program.parseAsync(['node', 'td', 'auth', 'token', token]),
            ).rejects.toThrow('Permission denied')
        })

        it('trims whitespace from token', async () => {
            const program = createProgram()
            const tokenWithWhitespace = '  some_token_123456789  '
            const expectedToken = 'some_token_123456789'

            stubProbeApiForUser()
            mockUpsertUser.mockResolvedValue({ storage: 'secure-store', replaced: false })

            await program.parseAsync(['node', 'td', 'auth', 'token', tokenWithWhitespace])

            expect(mockCreateApiForToken).toHaveBeenCalledWith(expectedToken)
            expect(mockUpsertUser).toHaveBeenCalledWith(
                expect.objectContaining({ token: expectedToken }),
            )
        })

        it('prompts interactively when no token argument given', async () => {
            const program = createProgram()
            const mockRl = {
                question: vi.fn((_prompt: string, cb: (answer: string) => void) => {
                    cb('interactive_token_456')
                }),
                close: vi.fn(),
                _writeToOutput: vi.fn(),
            }
            mockCreateInterface.mockReturnValue(mockRl as unknown as Interface)
            stubProbeApiForUser()
            mockUpsertUser.mockResolvedValue({ storage: 'secure-store', replaced: false })
            const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

            await program.parseAsync(['node', 'td', 'auth', 'token'])

            expect(mockRl.question).toHaveBeenCalled()
            expect(mockUpsertUser).toHaveBeenCalledWith(
                expect.objectContaining({ token: 'interactive_token_456' }),
            )
            writeSpy.mockRestore()
        })

        it('shows error when interactive input is empty', async () => {
            const program = createProgram()
            const mockRl = {
                question: vi.fn((_prompt: string, cb: (answer: string) => void) => {
                    cb('')
                }),
                close: vi.fn(),
                _writeToOutput: vi.fn(),
            }
            mockCreateInterface.mockReturnValue(mockRl as unknown as Interface)
            const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

            await program.parseAsync(['node', 'td', 'auth', 'token'])

            expect(mockUpsertUser).not.toHaveBeenCalled()
            expect(errorSpy).toHaveBeenCalledWith('Error:', 'No token provided')
            writeSpy.mockRestore()
        })

        it('shows "Updated stored token for" when account already existed', async () => {
            const program = createProgram()
            stubProbeApiForUser()
            mockUpsertUser.mockResolvedValue({ storage: 'secure-store', replaced: true })

            await program.parseAsync(['node', 'td', 'auth', 'token', 'some_token_123456789'])

            expect(consoleSpy).toHaveBeenCalledWith(
                '✓',
                `Updated stored token for ${TEST_USER.email}`,
            )
        })

        it('surfaces config-file fallback warning', async () => {
            const program = createProgram()
            stubProbeApiForUser()
            mockUpsertUser.mockResolvedValue({
                storage: 'config-file',
                replaced: false,
                warning:
                    'system credential manager unavailable; token saved as plaintext in /tmp/test-config.json',
            })

            await program.parseAsync(['node', 'td', 'auth', 'token', 'some_token_123456789'])

            expect(errorSpy).toHaveBeenCalledWith(
                'Warning:',
                'system credential manager unavailable; token saved as plaintext in /tmp/test-config.json',
            )
        })
    })

    // login subcommand: handled by @doist/cli-core/auth tests now.
    // The pre-extraction OAuth flow tests lived here and were dropped along
    // with `pkce.ts` / `oauth.ts` / `oauth-server.ts`.

    describe('status subcommand', () => {
        it('shows authenticated status when logged in', async () => {
            const program = createProgram()
            const mockApi = createMockApi({ getUser: vi.fn().mockResolvedValue(TEST_USER) })
            mockGetApi.mockResolvedValue(mockApi)
            mockGetAuthMetadata.mockResolvedValue({
                authMode: 'read-write',
                authScope: 'data:read_write,data:delete,project:delete',
                source: 'secure-store',
            })

            await program.parseAsync(['node', 'td', 'auth', 'status'])

            expect(consoleSpy).toHaveBeenCalledWith('✓', 'Authenticated')
            expect(consoleSpy).toHaveBeenCalledWith(`  Email: ${TEST_USER.email}`)
            expect(consoleSpy).toHaveBeenCalledWith(`  Name:  ${TEST_USER.fullName}`)
            expect(consoleSpy).toHaveBeenCalledWith('  Mode:  read-write')
        })

        it('marks the active user as default when matching', async () => {
            const program = createProgram()
            const mockApi = createMockApi({ getUser: vi.fn().mockResolvedValue(TEST_USER) })
            mockGetApi.mockResolvedValue(mockApi)
            mockGetAuthMetadata.mockResolvedValue({
                authMode: 'read-write',
                source: 'secure-store',
            })
            mockReadConfig.mockResolvedValue({ user: { defaultUser: TEST_USER.id } })

            await program.parseAsync(['node', 'td', 'auth', 'status'])

            expect(consoleSpy).toHaveBeenCalledWith('✓', 'Authenticated (default)')
        })

        it('lists other stored accounts', async () => {
            const program = createProgram()
            const mockApi = createMockApi({ getUser: vi.fn().mockResolvedValue(TEST_USER) })
            mockGetApi.mockResolvedValue(mockApi)
            mockGetAuthMetadata.mockResolvedValue({
                authMode: 'read-write',
                source: 'secure-store',
            })
            mockListStoredUsers.mockResolvedValue([
                { id: TEST_USER.id, email: TEST_USER.email },
                { id: '67890', email: 'other@example.com' },
            ])

            await program.parseAsync(['node', 'td', 'auth', 'status'])

            const lines = consoleSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n')
            expect(lines).toContain('Other stored accounts (1)')
            expect(lines).toContain('other@example.com')
        })

        it('outputs JSON when --json flag is used', async () => {
            const program = createProgram()
            const mockApi = createMockApi({ getUser: vi.fn().mockResolvedValue(TEST_USER) })
            mockGetApi.mockResolvedValue(mockApi)
            mockGetAuthMetadata.mockResolvedValue({
                authMode: 'read-write',
                authScope: 'data:read_write,data:delete,project:delete',
                source: 'secure-store',
            })
            mockListStoredUsers.mockResolvedValue([{ id: TEST_USER.id, email: TEST_USER.email }])
            mockReadConfig.mockResolvedValue({ user: { defaultUser: TEST_USER.id } })

            await program.parseAsync(['node', 'td', 'auth', 'status', '--json'])

            const printed = consoleSpy.mock.calls[0][0] as string
            const parsed = JSON.parse(printed)
            expect(parsed).toMatchObject({
                id: TEST_USER.id,
                email: TEST_USER.email,
                authMode: 'read-write',
                isDefault: true,
            })
        })

        it('throws NoTokenError when not authenticated', async () => {
            const program = createProgram()
            mockGetApi.mockRejectedValue(new NoTokenError())

            await expect(
                program.parseAsync(['node', 'td', 'auth', 'status']),
            ).rejects.toHaveProperty('code', 'NO_TOKEN')
        })
    })

    describe('logout subcommand', () => {
        it('clears the API token', async () => {
            const program = createProgram()
            mockClearApiToken.mockResolvedValue({ storage: 'secure-store' })

            await program.parseAsync(['node', 'td', 'auth', 'logout'])

            expect(mockClearApiToken).toHaveBeenCalled()
            expect(consoleSpy).toHaveBeenCalledWith('✓', 'Logged out')
        })
    })

    describe('token view subcommand', () => {
        let originalEnvToken: string | undefined

        beforeEach(() => {
            originalEnvToken = process.env[TOKEN_ENV_VAR]
            delete process.env[TOKEN_ENV_VAR]
        })

        afterEach(() => {
            if (originalEnvToken === undefined) {
                delete process.env[TOKEN_ENV_VAR]
            } else {
                process.env[TOKEN_ENV_VAR] = originalEnvToken
            }
        })

        it('prints the bare token to stdout', async () => {
            const program = createProgram()
            mockResolveActiveUser.mockResolvedValue({
                id: TEST_USER.id,
                email: TEST_USER.email,
                token: 'stored_token_abc123456',
                authMode: 'read-write',
                source: 'secure-store',
            })

            await program.parseAsync(['node', 'td', 'auth', 'token', 'view'])

            expect(mockResolveActiveUser).toHaveBeenCalled()
            expect(consoleSpy).toHaveBeenCalledTimes(1)
            expect(consoleSpy).toHaveBeenCalledWith('stored_token_abc123456')
        })

        it('refuses when TODOIST_API_TOKEN is set', async () => {
            const program = createProgram()
            process.env[TOKEN_ENV_VAR] = 'env_token_value'

            await expect(
                program.parseAsync(['node', 'td', 'auth', 'token', 'view']),
            ).rejects.toHaveProperty('code', 'TOKEN_FROM_ENV')
            expect(mockResolveActiveUser).not.toHaveBeenCalled()
            expect(consoleSpy).not.toHaveBeenCalled()
        })

        it('propagates NoTokenError when no users are stored', async () => {
            const program = createProgram()
            mockResolveActiveUser.mockRejectedValue(new NoTokenError())

            await expect(
                program.parseAsync(['node', 'td', 'auth', 'token', 'view']),
            ).rejects.toHaveProperty('code', 'NO_TOKEN')
            expect(consoleSpy).not.toHaveBeenCalled()
        })

        it('propagates UserNotFoundError when --user ref does not match', async () => {
            const program = createProgram()
            mockResolveActiveUser.mockRejectedValue(new UserNotFoundError('missing@example.com'))

            // `--user <ref>` is parsed from process.argv by the global-args
            // layer (not commander) and stripped before commander sees the
            // argv. Stub process.argv to mirror production wiring so the
            // test exercises the same code path as a real invocation.
            const originalArgv = process.argv
            process.argv = ['node', 'td', 'auth', 'token', 'view', '--user', 'missing@example.com']
            resetGlobalArgs()
            try {
                await expect(
                    program.parseAsync(['node', 'td', 'auth', 'token', 'view']),
                ).rejects.toHaveProperty('code', 'USER_NOT_FOUND')
            } finally {
                process.argv = originalArgv
                resetGlobalArgs()
            }
            expect(consoleSpy).not.toHaveBeenCalled()
        })
    })
})
