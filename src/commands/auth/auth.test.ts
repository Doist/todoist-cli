import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the auth-store factory so token / logout commands can drive a stub.
const setMock = vi.fn()
const clearMock = vi.fn()
const activeMock = vi.fn<(ref?: string) => Promise<unknown>>()
const lastStorageMock = vi.fn<() => unknown>()
const lastClearMock = vi.fn<() => unknown>()
vi.mock('../../lib/auth-store.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../lib/auth-store.js')>()
    return {
        ...actual,
        createTodoistTokenStore: () => ({
            active: activeMock,
            list: vi.fn().mockResolvedValue([]),
            setDefault: vi.fn(),
            set: setMock,
            clear: clearMock,
            getLastStorageResult: lastStorageMock,
            getLastClearResult: lastClearMock,
        }),
    }
})

// Stub `clearLegacyToken` so the wrap's empty-store legacy fallback can be
// observed without touching the real config/keyring. `vi.hoisted` is required
// here because vi.mock factories run before top-level `const` initializers,
// and the factory needs to close over a stable reference.
const { clearLegacyTokenMock } = vi.hoisted(() => ({
    clearLegacyTokenMock: vi.fn<() => Promise<unknown>>(),
}))
vi.mock('../../lib/auth.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../lib/auth.js')>()
    return {
        ...actual,
        getAuthMetadata: vi.fn(),
        listStoredUsers: vi.fn(),
        readConfig: vi.fn(),
        resolveActiveUser: vi.fn(),
        clearLegacyToken: clearLegacyTokenMock,
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
import type { TodoistAccount, TodoistTokenStore } from '../../lib/auth-store.js'
import { NoTokenError, getAuthMetadata, listStoredUsers, readConfig } from '../../lib/auth.js'
import { resetGlobalArgs } from '../../lib/global-args.js'
import { createMockApi } from '../../test-support/mock-api.js'
import { registerAuthCommand } from './index.js'
import { attachTodoistStatusCommand } from './status.js'

const mockCreateInterface = vi.mocked(createInterface)

const mockGetAuthMetadata = vi.mocked(getAuthMetadata)
const mockListStoredUsers = vi.mocked(listStoredUsers)
const mockReadConfig = vi.mocked(readConfig)
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
        beforeEach(() => {
            setMock.mockReset().mockResolvedValue(undefined)
            lastStorageMock.mockReset().mockReturnValue({ storage: 'secure-store' })
        })

        it('successfully saves a token', async () => {
            const program = createProgram()
            const token = 'some_token_123456789'

            stubProbeApiForUser()

            await program.parseAsync(['node', 'td', 'auth', 'token', token])

            expect(mockCreateApiForToken).toHaveBeenCalledWith(token)
            expect(setMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: TEST_USER.id,
                    email: TEST_USER.email,
                    label: TEST_USER.email,
                    auth_mode: 'unknown',
                }),
                token,
            )
            expect(consoleSpy).toHaveBeenCalledWith('✓', `Saved token for ${TEST_USER.email}`)
        })

        it('trims whitespace from token', async () => {
            const program = createProgram()
            const tokenWithWhitespace = '  some_token_123456789  '
            const expectedToken = 'some_token_123456789'

            stubProbeApiForUser()

            await program.parseAsync(['node', 'td', 'auth', 'token', tokenWithWhitespace])

            expect(mockCreateApiForToken).toHaveBeenCalledWith(expectedToken)
            expect(setMock).toHaveBeenCalledWith(expect.anything(), expectedToken)
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
            const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

            await program.parseAsync(['node', 'td', 'auth', 'token'])

            expect(mockRl.question).toHaveBeenCalled()
            expect(setMock).toHaveBeenCalledWith(expect.anything(), 'interactive_token_456')
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

            expect(setMock).not.toHaveBeenCalled()
            expect(errorSpy).toHaveBeenCalledWith('Error:', 'No token provided')
            writeSpy.mockRestore()
        })

        it('surfaces config-file fallback warning', async () => {
            const program = createProgram()
            stubProbeApiForUser()
            lastStorageMock.mockReturnValue({
                storage: 'config-file',
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

            expect(consoleSpy).toHaveBeenCalledWith('✓ Authenticated')
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

            expect(consoleSpy).toHaveBeenCalledWith('✓ Authenticated (default)')
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
            // status now first calls `store.active()` (via cli-core) and, if a
            // snapshot exists, takes the `createApiForToken(snapshot.token)`
            // short-circuit in `fetchLive`. Make that path reject the same way
            // so the test exercises both branches symmetrically.
            mockCreateApiForToken.mockImplementation(() => {
                throw new NoTokenError()
            })

            await expect(
                program.parseAsync(['node', 'td', 'auth', 'status']),
            ).rejects.toHaveProperty('code', 'NO_TOKEN')
        })

        // The default tests above exercise the unauthenticated/`onNotAuthenticated`
        // branch (real `store.active()` resolves to null in the test env because the
        // keyring is unreachable). This block drives a controllable snapshot store
        // directly into `attachTodoistStatusCommand` so the `fetchLive` →
        // `renderText`/`renderJson` path is also covered.
        describe('persisted-account snapshot path (fetchLive)', () => {
            const SNAPSHOT_ACCOUNT: TodoistAccount = {
                id: TEST_USER.id,
                email: TEST_USER.email,
                label: TEST_USER.email,
                auth_mode: 'read-write',
                auth_scope: 'data:read_write,data:delete,project:delete',
            }

            function programWithSnapshot(): Command {
                const program = new Command()
                program.exitOverride()
                const auth = program.command('auth')
                const snapshotStore: TodoistTokenStore = {
                    async active() {
                        return { token: 'snapshot_token', account: SNAPSHOT_ACCOUNT }
                    },
                    async set() {},
                    async clear() {},
                    async list() {
                        return [{ account: SNAPSHOT_ACCOUNT, isDefault: true }]
                    },
                    async setDefault() {},
                    getLastStorageResult: () => undefined,
                    getLastClearResult: () => undefined,
                }
                attachTodoistStatusCommand(auth, snapshotStore)
                return program
            }

            beforeEach(() => {
                const liveApi = createMockApi({ getUser: vi.fn().mockResolvedValue(TEST_USER) })
                mockCreateApiForToken.mockReturnValue(liveApi)
                mockGetAuthMetadata.mockResolvedValue({
                    authMode: 'read-write',
                    authScope: 'data:read_write,data:delete,project:delete',
                    source: 'secure-store',
                })
                mockListStoredUsers.mockResolvedValue([
                    { id: TEST_USER.id, email: TEST_USER.email },
                ])
                mockReadConfig.mockResolvedValue({ user: { defaultUser: TEST_USER.id } })
            })

            it('renders text status from the snapshot (no --user override)', async () => {
                await programWithSnapshot().parseAsync(['node', 'td', 'auth', 'status'])

                expect(mockCreateApiForToken).toHaveBeenCalledWith('snapshot_token')
                expect(consoleSpy).toHaveBeenCalledWith('✓ Authenticated (default)')
                expect(consoleSpy).toHaveBeenCalledWith(`  Email: ${TEST_USER.email}`)
                expect(consoleSpy).toHaveBeenCalledWith(`  Name:  ${TEST_USER.fullName}`)
                expect(consoleSpy).toHaveBeenCalledWith('  Mode:  read-write')
            })

            it('emits the JSON envelope from the snapshot path', async () => {
                await programWithSnapshot().parseAsync(['node', 'td', 'auth', 'status', '--json'])

                const printed = consoleSpy.mock.calls[0][0] as string
                const parsed = JSON.parse(printed)
                expect(parsed).toMatchObject({
                    id: TEST_USER.id,
                    email: TEST_USER.email,
                    fullName: TEST_USER.fullName,
                    authMode: 'read-write',
                    source: 'secure-store',
                    isDefault: true,
                })
            })

            it('falls back to getApi() when --user is set so the snapshot default is overridden', async () => {
                // Stash --user in process.argv so global-args picks it up.
                const overrideUser = { id: '99999', email: 'other@example.com', fullName: 'Other' }
                const liveApi = createMockApi({
                    getUser: vi.fn().mockResolvedValue(overrideUser),
                })
                mockGetApi.mockResolvedValue(liveApi)

                const originalArgv = process.argv
                process.argv = ['node', 'td', '--user', overrideUser.email, 'auth', 'status']
                resetGlobalArgs()
                try {
                    await programWithSnapshot().parseAsync(['node', 'td', 'auth', 'status'])
                } finally {
                    process.argv = originalArgv
                    resetGlobalArgs()
                }

                // With --user set, fetchLive must NOT call createApiForToken;
                // it re-resolves via getApi() so the selector is honoured.
                expect(mockCreateApiForToken).not.toHaveBeenCalled()
                expect(mockGetApi).toHaveBeenCalled()
                expect(consoleSpy).toHaveBeenCalledWith(`  Email: ${overrideUser.email}`)
            })
        })
    })

    describe('logout subcommand', () => {
        const WARNING_RESULT = {
            storage: 'config-file' as const,
            warning:
                'system credential manager unavailable; token cleared from plaintext config.json',
        }

        beforeEach(() => {
            clearMock.mockReset().mockResolvedValue(undefined)
            lastClearMock.mockReset().mockReturnValue({ storage: 'secure-store' })
            activeMock.mockReset()
            clearLegacyTokenMock.mockReset()
        })

        it('surfaces keyring-fallback warning to stderr', async () => {
            const program = createProgram()
            lastClearMock.mockReturnValue(WARNING_RESULT)

            await program.parseAsync(['node', 'td', 'auth', 'logout'])

            expect(errorSpy).toHaveBeenCalledWith('Warning:', WARNING_RESULT.warning)
        })

        it('threads --user from global args through to store.clear', async () => {
            // `index.ts` strips `--user` from process.argv before commander
            // runs; cli-core's `attachLogoutCommand` therefore can't see it.
            // The Todoist wrap reads `getRequestedUserRef()` from global args
            // and substitutes it when commander calls `store.clear(undefined)`.
            activeMock.mockResolvedValue({
                token: 'tok-a',
                account: { id: '111', email: 'a@example.com', label: 'a@example.com' },
            })

            const program = createProgram()
            const originalArgv = process.argv
            process.argv = ['node', 'td', '--user', 'a@example.com', 'auth', 'logout']
            resetGlobalArgs()
            try {
                await program.parseAsync(['node', 'td', 'auth', 'logout'])
                expect(clearMock).toHaveBeenCalledWith('a@example.com')
            } finally {
                process.argv = originalArgv
                resetGlobalArgs()
            }
        })

        it('throws UserNotFoundError when --user does not match any stored account', async () => {
            // cli-core's `clear(ref)` is contractually a no-op on miss; without
            // the wrap's pre-check, `logout --user mistake` would print
            // "✓ Logged out" and exit 0. The wrap surfaces the typed miss.
            activeMock.mockResolvedValue(null)

            const program = createProgram()
            const originalArgv = process.argv
            process.argv = ['node', 'td', '--user', 'missing@example.com', 'auth', 'logout']
            resetGlobalArgs()
            try {
                await expect(
                    program.parseAsync(['node', 'td', 'auth', 'logout']),
                ).rejects.toHaveProperty('code', 'USER_NOT_FOUND')
                expect(clearMock).not.toHaveBeenCalled()
            } finally {
                process.argv = originalArgv
                resetGlobalArgs()
            }
        })

        it('keeps the keyring-fallback warning on stderr in --json mode (and out of the JSON envelope)', async () => {
            // `attachTodoistLogoutCommand`'s `onCleared` branches on
            // `view.json || view.ndjson` to suppress the human "Stored token
            // removed" confirmation; a regression that leaks that text into
            // stdout would corrupt machine-output consumers.
            const program = createProgram()
            lastClearMock.mockReturnValue(WARNING_RESULT)

            await program.parseAsync(['node', 'td', 'auth', 'logout', '--json'])

            const stdout = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n')
            expect(stdout).not.toContain('Stored token removed')
            expect(errorSpy).toHaveBeenCalledWith('Warning:', WARNING_RESULT.warning)
        })
    })

    // `token view` is now wired via cli-core's `attachTokenViewCommand`;
    // bare-token output, `TOKEN_FROM_ENV` refusal, and `NOT_AUTHENTICATED`
    // are tested in cli-core itself. The `--user <ref>` wrap is exercised
    // via the logout tests above.
})
