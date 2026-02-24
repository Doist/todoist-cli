import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the auth module
vi.mock('../lib/auth.js', () => ({
    saveApiToken: vi.fn(),
    clearApiToken: vi.fn(),
    getSyncSettings: vi.fn().mockResolvedValue({
        enabled: false,
        ttlSeconds: 60,
        dbPath: '/tmp/todoist-cli-cache-test.db',
    }),
}))

// Mock the api module
vi.mock('../lib/api/core.js', () => ({
    getApi: vi.fn(),
}))

// Mock chalk to avoid colors in tests
vi.mock('chalk')

// Mock PKCE module
vi.mock('../lib/pkce.js', () => ({
    generateCodeVerifier: vi.fn(() => 'test_code_verifier'),
    generateCodeChallenge: vi.fn(() => 'test_code_challenge'),
    generateState: vi.fn(() => 'test_state'),
}))

// Mock OAuth server
vi.mock('../lib/oauth-server.js', () => ({
    startCallbackServer: vi.fn(),
    OAUTH_REDIRECT_URI: 'http://localhost:8765/callback',
}))

// Mock OAuth module
vi.mock('../lib/oauth.js', () => ({
    buildAuthorizationUrl: vi.fn(() => 'https://todoist.com/oauth/authorize?test=1'),
    exchangeCodeForToken: vi.fn(),
}))

// Mock open module
vi.mock('open', () => ({
    default: vi.fn(),
}))

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
import open from 'open'
import { registerAuthCommand } from '../commands/auth.js'
import { getApi } from '../lib/api/core.js'
import { clearApiToken, saveApiToken } from '../lib/auth.js'
import { exchangeCodeForToken } from '../lib/oauth.js'
import { startCallbackServer } from '../lib/oauth-server.js'
import { createMockApi } from './helpers/mock-api.js'

const mockCreateInterface = vi.mocked(createInterface)

const mockSaveApiToken = vi.mocked(saveApiToken)
const mockClearApiToken = vi.mocked(clearApiToken)
const mockGetApi = vi.mocked(getApi)
const mockStartCallbackServer = vi.mocked(startCallbackServer)
const mockExchangeCodeForToken = vi.mocked(exchangeCodeForToken)
const mockOpen = vi.mocked(open)

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerAuthCommand(program)
    return program
}

describe('auth command', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
        consoleSpy.mockRestore()
    })

    describe('token subcommand', () => {
        it('successfully saves a token', async () => {
            const program = createProgram()
            const token = 'some_token_123456789'

            mockSaveApiToken.mockResolvedValue(undefined)

            await program.parseAsync(['node', 'td', 'auth', 'token', token])

            expect(mockSaveApiToken).toHaveBeenCalledWith(token)
            expect(consoleSpy).toHaveBeenCalledWith('✓', 'API token saved successfully!')
            expect(consoleSpy).toHaveBeenCalledWith(
                'Token saved to ~/.config/todoist-cli/config.json',
            )
        })

        it('handles saveApiToken errors', async () => {
            const program = createProgram()
            const token = 'some_token_123456789'

            mockSaveApiToken.mockRejectedValue(new Error('Permission denied'))

            await expect(
                program.parseAsync(['node', 'td', 'auth', 'token', token]),
            ).rejects.toThrow('Permission denied')

            expect(mockSaveApiToken).toHaveBeenCalledWith(token)
        })

        it('trims whitespace from token', async () => {
            const program = createProgram()
            const tokenWithWhitespace = '  some_token_123456789  '
            const expectedToken = 'some_token_123456789'

            mockSaveApiToken.mockResolvedValue(undefined)

            await program.parseAsync(['node', 'td', 'auth', 'token', tokenWithWhitespace])

            expect(mockSaveApiToken).toHaveBeenCalledWith(expectedToken)
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
            mockSaveApiToken.mockResolvedValue(undefined)
            const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

            await program.parseAsync(['node', 'td', 'auth', 'token'])

            expect(mockRl.question).toHaveBeenCalled()
            expect(mockRl.close).toHaveBeenCalled()
            expect(mockSaveApiToken).toHaveBeenCalledWith('interactive_token_456')
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
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

            await program.parseAsync(['node', 'td', 'auth', 'token'])

            expect(mockSaveApiToken).not.toHaveBeenCalled()
            expect(errorSpy).toHaveBeenCalledWith('Error:', 'No token provided')
            writeSpy.mockRestore()
            errorSpy.mockRestore()
        })
    })

    describe('login subcommand (OAuth flow)', () => {
        it('completes OAuth flow successfully', async () => {
            const program = createProgram()
            const authCode = 'oauth_auth_code_123'
            const accessToken = 'oauth_access_token_456'

            mockStartCallbackServer.mockReturnValue({
                promise: Promise.resolve(authCode),
                cleanup: vi.fn(),
            })
            mockExchangeCodeForToken.mockResolvedValue(accessToken)
            mockSaveApiToken.mockResolvedValue(undefined)
            mockOpen.mockResolvedValue({} as Awaited<ReturnType<typeof open>>)

            await program.parseAsync(['node', 'td', 'auth', 'login'])

            expect(mockOpen).toHaveBeenCalledWith('https://todoist.com/oauth/authorize?test=1')
            expect(mockStartCallbackServer).toHaveBeenCalledWith('test_state')
            expect(mockExchangeCodeForToken).toHaveBeenCalledWith(authCode, 'test_code_verifier')
            expect(mockSaveApiToken).toHaveBeenCalledWith(accessToken)
            expect(consoleSpy).toHaveBeenCalledWith('✓', 'Successfully logged in!')
        })

        it('handles OAuth callback server error', async () => {
            const program = createProgram()
            const mockCleanup = vi.fn()

            mockStartCallbackServer.mockReturnValue({
                promise: Promise.reject(new Error('OAuth callback timed out')),
                cleanup: mockCleanup,
            })
            mockOpen.mockResolvedValue({} as Awaited<ReturnType<typeof open>>)

            await expect(program.parseAsync(['node', 'td', 'auth', 'login'])).rejects.toThrow(
                'OAuth callback timed out',
            )

            expect(mockCleanup).toHaveBeenCalled()
            expect(mockSaveApiToken).not.toHaveBeenCalled()
        })

        it('handles token exchange error', async () => {
            const program = createProgram()
            const mockCleanup = vi.fn()

            mockStartCallbackServer.mockReturnValue({
                promise: Promise.resolve('auth_code'),
                cleanup: mockCleanup,
            })
            mockExchangeCodeForToken.mockRejectedValue(new Error('Token exchange failed: 400'))
            mockOpen.mockResolvedValue({} as Awaited<ReturnType<typeof open>>)

            await expect(program.parseAsync(['node', 'td', 'auth', 'login'])).rejects.toThrow(
                'Token exchange failed',
            )

            expect(mockCleanup).toHaveBeenCalled()
            expect(mockSaveApiToken).not.toHaveBeenCalled()
        })

        it('calls cleanup when open() throws', async () => {
            const program = createProgram()
            const mockCleanup = vi.fn()

            mockStartCallbackServer.mockReturnValue({
                promise: new Promise(() => {}), // never resolves
                cleanup: mockCleanup,
            })
            mockOpen.mockRejectedValue(new Error('Failed to open browser'))

            await expect(program.parseAsync(['node', 'td', 'auth', 'login'])).rejects.toThrow(
                'Failed to open browser',
            )

            expect(mockCleanup).toHaveBeenCalled()
            expect(mockSaveApiToken).not.toHaveBeenCalled()
        })
    })

    describe('status subcommand', () => {
        it('shows authenticated status when logged in', async () => {
            const program = createProgram()
            const mockUser = { email: 'test@example.com', fullName: 'Test User' }
            const mockApi = createMockApi({ getUser: vi.fn().mockResolvedValue(mockUser) })
            mockGetApi.mockResolvedValue(mockApi)

            await program.parseAsync(['node', 'td', 'auth', 'status'])

            expect(mockGetApi).toHaveBeenCalled()
            expect(mockApi.getUser).toHaveBeenCalled()
            expect(consoleSpy).toHaveBeenCalledWith('✓', 'Authenticated')
            expect(consoleSpy).toHaveBeenCalledWith('  Email: test@example.com')
            expect(consoleSpy).toHaveBeenCalledWith('  Name:  Test User')
        })

        it('shows not authenticated when no token', async () => {
            const program = createProgram()
            mockGetApi.mockRejectedValue(new Error('No API token found'))

            await program.parseAsync(['node', 'td', 'auth', 'status'])

            expect(consoleSpy).toHaveBeenCalledWith('Not authenticated')
        })
    })

    describe('logout subcommand', () => {
        it('clears the API token', async () => {
            const program = createProgram()
            mockClearApiToken.mockResolvedValue(undefined)

            await program.parseAsync(['node', 'td', 'auth', 'logout'])

            expect(mockClearApiToken).toHaveBeenCalled()
            expect(consoleSpy).toHaveBeenCalledWith('✓', 'Logged out')
            expect(consoleSpy).toHaveBeenCalledWith(
                'Token removed from ~/.config/todoist-cli/config.json',
            )
        })
    })
})
