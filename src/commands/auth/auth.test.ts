import {
    type StoreEntry,
    alanGrant,
    buildTokenStore,
    captureConsole,
    captureStream,
    createTestProgram,
} from '@doist/cli-core/testing'
import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Each test drives cli-core's stateful `buildTokenStore` fake. The mock factory
// returns whatever store the current test installed via `useStore()` (see the
// `makeTodoistStore` helper below), so the store's entries/spies are per-test.
const holder = vi.hoisted(() => ({
    store: undefined as import('../../lib/auth-store.js').TodoistTokenStore | undefined,
}))
vi.mock('../../lib/auth-store.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../lib/auth-store.js')>()
    return {
        ...actual,
        createTodoistTokenStore: () => {
            if (!holder.store) {
                throw new Error('test store not set; call useStore() before createProgram()')
            }
            return holder.store
        },
    }
})

vi.mock('../../lib/auth.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../lib/auth.js')>()
    return {
        ...actual,
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
import type { TokenStorageResult } from '@doist/cli-core/auth'
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
    return createTestProgram(registerAuthCommand)
}

type MakeStoreOpts = {
    // Default [] — an EMPTY store. A seeded `active()` snapshot would flip
    // `status` onto the fetchLive path, so empty is the right default.
    entries?: StoreEntry<TodoistAccount>[]
    lastStorage?: TokenStorageResult
    lastClear?: TokenStorageResult
}

/**
 * Wrap cli-core's stateful `buildTokenStore` fake, bolting on the keyring-only
 * methods (`getLastStorageResult` / `getLastClearResult` / `activeAccount`) that
 * live on `KeyringTokenStore` but not `TokenStore`, so the result satisfies
 * `TodoistTokenStore`. Returns the harness too (`state.entries`, `*Spy`) for
 * assertions, plus setters to mutate the storage-result shape mid-test.
 */
function makeTodoistStore(opts: MakeStoreOpts = {}) {
    const harness = buildTokenStore<TodoistAccount>({ entries: opts.entries ?? [] })
    let lastStorage = opts.lastStorage
    let lastClear = opts.lastClear
    const store = Object.assign(harness.store as unknown as TodoistTokenStore, {
        getLastStorageResult: () => lastStorage,
        getLastClearResult: () => lastClear,
        // Resolve through the fake's own `active()` (which applies the store
        // matcher) rather than re-deriving ref matching here, then read the
        // default flag off `list()` for the resolved account.
        activeAccount: async (ref?: string) => {
            const resolved = await harness.store.active(ref)
            if (!resolved) return null
            const records = await harness.store.list()
            const isDefault =
                records.find((r) => r.account.id === resolved.account.id)?.isDefault ?? false
            return { account: resolved.account, isDefault }
        },
    })
    return {
        store,
        harness,
        setLastStorage: (r?: TokenStorageResult) => {
            lastStorage = r
        },
        setLastClear: (r?: TokenStorageResult) => {
            lastClear = r
        },
    }
}

/** Build a store and install it for the eager `createTodoistTokenStore()` call. */
function useStore(opts: MakeStoreOpts = {}) {
    const made = makeTodoistStore(opts)
    holder.store = made.store
    return made
}

/** Explicit empty-store install for the logged-out / `onNotAuthenticated` path. */
function useEmptyStore() {
    return useStore()
}

describe('auth command', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>
    let errorSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        consoleSpy = captureConsole()
        errorSpy = captureConsole('error')
        mockListStoredUsers.mockResolvedValue([])
        mockReadConfig.mockResolvedValue({})
        // No default store: a test that forgets `useStore()`/`useEmptyStore()`
        // hits the factory's "not set" throw rather than silently falling back
        // to the logged-out path and mis-covering a stored/snapshot branch.
        holder.store = undefined
    })

    afterEach(() => {
        process.exitCode = undefined
    })

    describe('token subcommand', () => {
        it('successfully saves a token', async () => {
            const { harness } = useStore({ lastStorage: { storage: 'secure-store' } })
            const program = createProgram()
            const token = 'some_token_123456789'

            stubProbeApiForUser()

            await program.parseAsync(['node', 'td', 'auth', 'token', token])

            expect(mockCreateApiForToken).toHaveBeenCalledWith(token)
            expect(harness.state.entries).toHaveLength(1)
            const [entry] = harness.state.entries
            expect(entry.account).toEqual(
                expect.objectContaining({
                    id: TEST_USER.id,
                    email: TEST_USER.email,
                    label: TEST_USER.email,
                    auth_mode: 'unknown',
                }),
            )
            expect(entry.token).toBe(token)
            expect(consoleSpy).toHaveBeenCalledWith('✓', `Saved token for ${TEST_USER.email}`)
        })

        it('trims whitespace from token', async () => {
            const { harness } = useStore({ lastStorage: { storage: 'secure-store' } })
            const program = createProgram()
            const tokenWithWhitespace = '  some_token_123456789  '
            const expectedToken = 'some_token_123456789'

            stubProbeApiForUser()

            await program.parseAsync(['node', 'td', 'auth', 'token', tokenWithWhitespace])

            expect(mockCreateApiForToken).toHaveBeenCalledWith(expectedToken)
            expect(harness.state.entries[0]?.token).toBe(expectedToken)
        })

        it('prompts interactively when no token argument given', async () => {
            const { harness } = useStore({ lastStorage: { storage: 'secure-store' } })
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
            captureStream()

            await program.parseAsync(['node', 'td', 'auth', 'token'])

            expect(mockRl.question).toHaveBeenCalled()
            expect(harness.state.entries[0]?.token).toBe('interactive_token_456')
        })

        it('shows error when interactive input is empty', async () => {
            const { harness } = useStore({ lastStorage: { storage: 'secure-store' } })
            const program = createProgram()
            const mockRl = {
                question: vi.fn((_prompt: string, cb: (answer: string) => void) => {
                    cb('')
                }),
                close: vi.fn(),
                _writeToOutput: vi.fn(),
            }
            mockCreateInterface.mockReturnValue(mockRl as unknown as Interface)
            captureStream()

            await program.parseAsync(['node', 'td', 'auth', 'token'])

            expect(harness.state.entries).toHaveLength(0)
            expect(errorSpy).toHaveBeenCalledWith('Error:', 'No token provided')
        })

        it('surfaces config-file fallback warning', async () => {
            useStore({
                lastStorage: {
                    storage: 'config-file',
                    warning:
                        'system credential manager unavailable; token saved as plaintext in /tmp/test-config.json',
                },
            })
            const program = createProgram()
            stubProbeApiForUser()

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
            useEmptyStore()
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
            useEmptyStore()
            const program = createProgram()
            const mockApi = createMockApi({ getUser: vi.fn().mockResolvedValue(TEST_USER) })
            mockGetApi.mockResolvedValue(mockApi)
            mockGetAuthMetadata.mockResolvedValue({
                authMode: 'read-write',
                source: 'secure-store',
            })
            mockReadConfig.mockResolvedValue({
                user: { defaultUser: TEST_USER.id },
                users: [{ id: TEST_USER.id, email: TEST_USER.email }],
            })

            await program.parseAsync(['node', 'td', 'auth', 'status'])

            expect(consoleSpy).toHaveBeenCalledWith('✓ Authenticated (default)')
        })

        it('marks a lone account as default with no pinned defaultUser', async () => {
            // Effective-default rule: a single stored account is implicitly the
            // default, so the marker matches `accounts list` even with no pin.
            useEmptyStore()
            const program = createProgram()
            const mockApi = createMockApi({ getUser: vi.fn().mockResolvedValue(TEST_USER) })
            mockGetApi.mockResolvedValue(mockApi)
            mockGetAuthMetadata.mockResolvedValue({
                authMode: 'read-write',
                source: 'secure-store',
            })
            mockReadConfig.mockResolvedValue({
                users: [{ id: TEST_USER.id, email: TEST_USER.email }],
            })

            await program.parseAsync(['node', 'td', 'auth', 'status'])

            expect(consoleSpy).toHaveBeenCalledWith('✓ Authenticated (default)')
        })

        it('lists other stored accounts', async () => {
            useEmptyStore()
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
            useEmptyStore()
            const program = createProgram()
            const mockApi = createMockApi({ getUser: vi.fn().mockResolvedValue(TEST_USER) })
            mockGetApi.mockResolvedValue(mockApi)
            mockGetAuthMetadata.mockResolvedValue({
                authMode: 'read-write',
                authScope: 'data:read_write,data:delete,project:delete',
                source: 'secure-store',
            })
            mockListStoredUsers.mockResolvedValue([{ id: TEST_USER.id, email: TEST_USER.email }])
            mockReadConfig.mockResolvedValue({
                user: { defaultUser: TEST_USER.id },
                users: [{ id: TEST_USER.id, email: TEST_USER.email }],
            })

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
            useEmptyStore()
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
                // Status with `fetchLive` reads `activeBundle()` first and, on a
                // null bundle with no `--user`, treats the account as logged out.
                // Seed a bundle so the snapshot path resolves (token comes from
                // `bundle.accessToken`).
                const { store } = makeTodoistStore({
                    entries: [
                        {
                            account: SNAPSHOT_ACCOUNT,
                            isDefault: true,
                            bundle: { accessToken: 'snapshot_token' },
                        },
                    ],
                })
                attachTodoistStatusCommand(auth, store)
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
                mockReadConfig.mockResolvedValue({
                    user: { defaultUser: TEST_USER.id },
                    users: [{ id: TEST_USER.id, email: TEST_USER.email }],
                })
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

        it('surfaces keyring-fallback warning to stderr', async () => {
            useStore({ lastClear: WARNING_RESULT })
            const program = createProgram()

            await program.parseAsync(['node', 'td', 'auth', 'logout'])

            expect(errorSpy).toHaveBeenCalledWith('Warning:', WARNING_RESULT.warning)
        })

        it('threads --user from global args through to store.clear', async () => {
            // `index.ts` strips `--user` from process.argv before commander
            // runs; cli-core's `attachLogoutCommand` therefore can't see it.
            // The Todoist wrap reads `getRequestedUserRef()` from global args
            // and substitutes it when commander calls `store.clear(undefined)`.
            // Existence is checked via `store.list()` (no token side effect),
            // not `store.active()`.
            const { harness } = useStore({
                entries: [{ account: alanGrant as TodoistAccount, isDefault: true }],
            })

            const program = createProgram()
            const originalArgv = process.argv
            process.argv = ['node', 'td', '--user', alanGrant.email, 'auth', 'logout']
            resetGlobalArgs()
            try {
                await program.parseAsync(['node', 'td', 'auth', 'logout'])
                expect(harness.clearSpy).toHaveBeenCalledWith(alanGrant.email)
            } finally {
                process.argv = originalArgv
                resetGlobalArgs()
            }
        })

        it('throws UserNotFoundError when --user does not match any stored account', async () => {
            // cli-core's `clear(ref)` is contractually a no-op on miss; without
            // the wrap's pre-check, `logout --user mistake` would print
            // "✓ Logged out" and exit 0. The wrap surfaces the typed miss.
            const { harness } = useStore()

            const program = createProgram()
            const originalArgv = process.argv
            process.argv = ['node', 'td', '--user', 'missing@ingen.com', 'auth', 'logout']
            resetGlobalArgs()
            try {
                await expect(
                    program.parseAsync(['node', 'td', 'auth', 'logout']),
                ).rejects.toHaveProperty('code', 'ACCOUNT_NOT_FOUND')
                expect(harness.clearSpy).not.toHaveBeenCalled()
            } finally {
                process.argv = originalArgv
                resetGlobalArgs()
            }
        })

        it('emits the JSON envelope on stdout and routes the keyring warning to stderr under --json', async () => {
            // `attachTodoistLogoutCommand`'s `onCleared` branches on
            // `view.json || view.ndjson` to suppress the human "Stored token
            // removed" confirmation; cli-core then prints `{ok: true}`. A
            // regression that leaked human prose into stdout — or dropped the
            // envelope — would corrupt machine-output consumers.
            useStore({ lastClear: WARNING_RESULT })
            const program = createProgram()

            await program.parseAsync(['node', 'td', 'auth', 'logout', '--json'])

            const stdout = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n')
            expect(stdout).toContain('"ok": true')
            expect(stdout).not.toContain('Stored token removed')
            expect(errorSpy).toHaveBeenCalledWith('Warning:', WARNING_RESULT.warning)
        })
    })

    describe('token view subcommand', () => {
        // `attachTokenViewCommand`'s bare-token output, TOKEN_FROM_ENV
        // refusal, and NOT_AUTHENTICATED on no-snapshot are all tested in
        // cli-core. The wrap's `--user` injection is exercised here because
        // it goes through `withUserRefAware.active`, which the logout tests
        // don't cover (they only exercise `.clear`).

        it('routes --user from global args through the active() path', async () => {
            const { harness } = useStore({
                entries: [
                    {
                        account: alanGrant as TodoistAccount,
                        isDefault: true,
                        token: 'stored-token-1234567',
                    },
                ],
            })

            const program = createProgram()
            const stdoutWrite = captureStream()
            const originalArgv = process.argv
            process.argv = ['node', 'td', '--user', alanGrant.email, 'auth', 'token', 'view']
            resetGlobalArgs()
            try {
                await program.parseAsync(['node', 'td', 'auth', 'token', 'view'])
                expect(harness.activeSpy).toHaveBeenCalledWith(alanGrant.email)
                expect(stdoutWrite).toHaveBeenCalledWith('stored-token-1234567')
            } finally {
                process.argv = originalArgv
                resetGlobalArgs()
            }
        })

        it('surfaces UserNotFoundError when --user does not match', async () => {
            const { harness } = useStore()

            const program = createProgram()
            const originalArgv = process.argv
            process.argv = ['node', 'td', '--user', 'nobody@ingen.com', 'auth', 'token', 'view']
            resetGlobalArgs()
            try {
                await expect(
                    program.parseAsync(['node', 'td', 'auth', 'token', 'view']),
                ).rejects.toHaveProperty('code', 'ACCOUNT_NOT_FOUND')
                expect(harness.activeSpy).not.toHaveBeenCalled()
            } finally {
                process.argv = originalArgv
                resetGlobalArgs()
            }
        })
    })
})
