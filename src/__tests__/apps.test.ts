import { TodoistRequestError } from '@doist/todoist-sdk'
import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api/core.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../lib/api/core.js')>()
    return {
        ...actual,
        getApi: vi.fn(),
    }
})

vi.mock('../lib/auth.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../lib/auth.js')>()
    return {
        ...actual,
        getAuthMetadata: vi.fn(),
    }
})

import { registerAppsCommand } from '../commands/apps/index.js'
import { getApi, wrapApiError } from '../lib/api/core.js'
import { getAuthMetadata } from '../lib/auth.js'
import { CliError } from '../lib/errors.js'
import { createMockApi, type MockApi } from './helpers/mock-api.js'

const mockGetApi = vi.mocked(getApi)
const mockGetAuthMetadata = vi.mocked(getAuthMetadata)

function createProgram() {
    const program = new Command()
    program.exitOverride()
    registerAppsCommand(program)
    return program
}

const APP_A = {
    id: '9909',
    status: 'public',
    displayName: 'Todoist for VS Code',
    userId: '6080840',
    createdAt: new Date('2020-03-13T16:56:05Z'),
    serviceUrl: 'http://localhost',
    oauthRedirectUri: 'vscode://doist.todoist-vs-code/auth-complete',
    description: 'Todoist for VS Code',
    iconSm: null,
    iconMd: null,
    iconLg: null,
    appTokenScopes: null,
}

const APP_B = {
    id: '9910',
    status: 'public',
    displayName: 'Zapier Connector',
    userId: '6080840',
    createdAt: new Date('2021-06-01T00:00:00Z'),
    serviceUrl: null,
    oauthRedirectUri: null,
    description: null,
    iconSm: null,
    iconMd: null,
    iconLg: null,
    appTokenScopes: ['data:read'],
}

const APP_A_DETAIL = {
    ...APP_A,
    description: 'Helps you manage tasks from VS Code',
    appTokenScopes: ['data:read', 'data:read_write'],
    iconMd: 'https://cdn.example.com/icon.png',
    userCount: 42,
}

const APP_B_DETAIL = {
    ...APP_B,
    userCount: 7,
}

describe('apps list', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('lists apps with displayName followed by (id:N) and a description line', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getApps.mockResolvedValue([APP_A, APP_B])

        await program.parseAsync(['node', 'td', 'apps', 'list'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        // Name leads, id follows in the (id:N) form so it's distinguishable in --accessible mode
        expect(output).toContain('Todoist for VS Code (id:9909)')
        expect(output).toContain('Zapier Connector (id:9910)')
        // App B has no description → fallback string
        expect(output).toContain('(no description)')
        consoleSpy.mockRestore()
    })

    it('shows "No apps found." when empty', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getApps.mockResolvedValue([])

        await program.parseAsync(['node', 'td', 'apps', 'list'])

        expect(consoleSpy).toHaveBeenCalledWith('No apps found.')
        consoleSpy.mockRestore()
    })

    it('outputs full JSON with --json flag', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getApps.mockResolvedValue([APP_A])

        await program.parseAsync(['node', 'td', 'apps', 'list', '--json'])

        const output = consoleSpy.mock.calls[0][0] as string
        const parsed = JSON.parse(output)
        expect(Array.isArray(parsed)).toBe(true)
        expect(parsed[0].id).toBe('9909')
        expect(parsed[0].displayName).toBe('Todoist for VS Code')
        expect(parsed[0].oauthRedirectUri).toBe('vscode://doist.todoist-vs-code/auth-complete')
        consoleSpy.mockRestore()
    })

    it('outputs NDJSON with --ndjson flag', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getApps.mockResolvedValue([APP_A, APP_B])

        await program.parseAsync(['node', 'td', 'apps', 'list', '--ndjson'])

        const output = consoleSpy.mock.calls[0][0] as string
        const lines = output.split('\n')
        expect(lines).toHaveLength(2)
        expect(JSON.parse(lines[0]).id).toBe('9909')
        expect(JSON.parse(lines[1]).id).toBe('9910')
        consoleSpy.mockRestore()
    })
})

describe('apps view', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('resolves id:N directly via getApp without listing', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)

        await program.parseAsync(['node', 'td', 'apps', 'view', 'id:9909'])

        expect(mockApi.getApp).toHaveBeenCalledWith('9909')
        expect(mockApi.getApps).not.toHaveBeenCalled()
        consoleSpy.mockRestore()
    })

    it('resolves a raw numeric id via getApp directly (no listing roundtrip)', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)

        await program.parseAsync(['node', 'td', 'apps', 'view', '9909'])

        expect(mockApi.getApp).toHaveBeenCalledWith('9909')
        expect(mockApi.getApps).not.toHaveBeenCalled()
        consoleSpy.mockRestore()
    })

    it('resolves a name via fuzzy match then re-fetches via getApp to enrich with userCount', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getApps.mockResolvedValue([APP_A, APP_B])
        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)

        await program.parseAsync(['node', 'td', 'apps', 'view', 'Todoist for VS Code'])

        // Listing roundtrip for the name match, then a single detail fetch
        // (no third call from inside viewApp).
        expect(mockApi.getApps).toHaveBeenCalledTimes(1)
        expect(mockApi.getApp).toHaveBeenCalledTimes(1)
        expect(mockApi.getApp).toHaveBeenCalledWith('9909')

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Todoist for VS Code')
        expect(output).toContain('ID:             9909')
        expect(output).toContain('Status:         public')
        expect(output).toContain('Users:          42')
        expect(output).toContain('Created:        2020-03-13')
        expect(output).toContain('Service URL:    http://localhost')
        expect(output).toContain('OAuth redirect: vscode://doist.todoist-vs-code/auth-complete')
        expect(output).toContain('Token scopes:   data:read, data:read_write')
        expect(output).toContain('Helps you manage tasks from VS Code')
        consoleSpy.mockRestore()
    })

    it('does not call getApp twice on id:N (no redundant detail fetch)', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)

        await program.parseAsync(['node', 'td', 'apps', 'view', 'id:9909'])

        expect(mockApi.getApp).toHaveBeenCalledTimes(1)
        consoleSpy.mockRestore()
    })

    it('shows fallback strings for null fields and (none) for empty token scopes', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getApp.mockResolvedValue(APP_B_DETAIL)

        await program.parseAsync(['node', 'td', 'apps', 'view', 'id:9910'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Service URL:    (none)')
        expect(output).toContain('OAuth redirect: (none)')
        expect(output).toContain('Token scopes:   data:read')
        expect(output).toContain('(no description)')
        consoleSpy.mockRestore()
    })

    it('throws AMBIGUOUS_APP when a substring matches multiple apps', async () => {
        const program = createProgram()

        mockApi.getApps.mockResolvedValue([
            { ...APP_A, displayName: 'Todoist for VS Code' },
            { ...APP_B, displayName: 'Todoist for Twist' },
        ])

        await expect(
            program.parseAsync(['node', 'td', 'apps', 'view', 'todoist for']),
        ).rejects.toMatchObject({ code: 'AMBIGUOUS_APP' })
        expect(mockApi.getApp).not.toHaveBeenCalled()
    })

    it('throws APP_NOT_FOUND when nothing matches', async () => {
        const program = createProgram()

        mockApi.getApps.mockResolvedValue([APP_A])

        await expect(
            program.parseAsync(['node', 'td', 'apps', 'view', 'nope']),
        ).rejects.toMatchObject({ code: 'APP_NOT_FOUND' })
    })

    it('converts a wrapped 404 from getApp into APP_NOT_FOUND for a non-existent numeric id', async () => {
        const program = createProgram()

        // The api Proxy in core.ts wraps TodoistRequestError(404) → CliError('NOT_FOUND').
        // resolveAppRef must catch that wrapped form too, not just the raw SDK error.
        mockApi.getApp.mockRejectedValue(new CliError('NOT_FOUND', 'HTTP 404: Not Found'))

        await expect(
            program.parseAsync(['node', 'td', 'apps', 'view', '99999999']),
        ).rejects.toMatchObject({ code: 'APP_NOT_FOUND' })
        expect(mockApi.getApps).not.toHaveBeenCalled()
    })

    it('also converts a wrapped 404 to APP_NOT_FOUND for the id:N form (shared id-path handling)', async () => {
        const program = createProgram()

        mockApi.getApp.mockRejectedValue(new CliError('NOT_FOUND', 'HTTP 404: Not Found'))

        await expect(
            program.parseAsync(['node', 'td', 'apps', 'view', 'id:99999999']),
        ).rejects.toMatchObject({ code: 'APP_NOT_FOUND' })
        expect(mockApi.getApp).toHaveBeenCalledWith('99999999')
        expect(mockApi.getApps).not.toHaveBeenCalled()
    })

    it('treats `td apps <ref>` as `td apps view <ref>` (implicit default subcommand)', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)

        await program.parseAsync(['node', 'td', 'apps', 'id:9909'])

        expect(mockApi.getApp).toHaveBeenCalledWith('9909')
        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Todoist for VS Code')
        expect(output).toContain('ID:             9909')
        consoleSpy.mockRestore()
    })

    it('does not attempt getApp() for alphanumeric refs (avoids the 400 from the apps endpoint)', async () => {
        const program = createProgram()

        mockApi.getApps.mockResolvedValue([APP_A])

        await expect(
            program.parseAsync(['node', 'td', 'apps', 'view', 'doesnotexist-xyz123']),
        ).rejects.toMatchObject({ code: 'APP_NOT_FOUND' })
        expect(mockApi.getApp).not.toHaveBeenCalled()
    })

    it('treats empty-string serviceUrl/oauthRedirectUri the same as null', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getApp.mockResolvedValue({
            ...APP_A_DETAIL,
            serviceUrl: '',
            oauthRedirectUri: '',
        })

        await program.parseAsync(['node', 'td', 'apps', 'view', 'id:9909'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Service URL:    (none)')
        expect(output).toContain('OAuth redirect: (none)')
        consoleSpy.mockRestore()
    })

    it('outputs full JSON of AppWithUserCount with --json', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)

        await program.parseAsync(['node', 'td', 'apps', 'view', 'id:9909', '--json'])

        const output = consoleSpy.mock.calls[0][0] as string
        const parsed = JSON.parse(output)
        expect(parsed.id).toBe('9909')
        expect(parsed.userCount).toBe(42)
        expect(parsed.appTokenScopes).toEqual(['data:read', 'data:read_write'])
        consoleSpy.mockRestore()
    })

    it('outputs single-line JSON with --ndjson', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)

        await program.parseAsync(['node', 'td', 'apps', 'view', 'id:9909', '--ndjson'])

        const output = consoleSpy.mock.calls[0][0] as string
        expect(output.split('\n')).toHaveLength(1)
        expect(JSON.parse(output).id).toBe('9909')
        consoleSpy.mockRestore()
    })
})

describe('wrapApiError → MISSING_SCOPE detection', () => {
    function scopeError() {
        return new TodoistRequestError('HTTP 403: Forbidden', 403, {
            error: 'Insufficient Token scope',
            error_code: 403,
            error_extra: { access_type: 'access_token' },
            error_tag: 'AUTH_INSUFFICIENT_TOKEN_SCOPE',
            http_code: 403,
        })
    }

    beforeEach(() => {
        vi.clearAllMocks()
        mockGetAuthMetadata.mockResolvedValue({
            authMode: 'read-write',
            source: 'secure-store',
        })
    })

    it('emits the app-management hint for app-management methods (getApps, getApp)', async () => {
        for (const method of ['getApps', 'getApp']) {
            const wrapped = (await wrapApiError(scopeError(), method)) as CliError
            expect(wrapped.code).toBe('MISSING_SCOPE')
            expect(wrapped.hints?.[0]).toContain('--additional-scopes=app-management')
            expect(wrapped.hints?.[0]).toContain('dev:app_console')
        }
    })

    it('emits the backups hint for backup methods (getBackups, downloadBackup)', async () => {
        for (const method of ['getBackups', 'downloadBackup']) {
            const wrapped = (await wrapApiError(scopeError(), method)) as CliError
            expect(wrapped.code).toBe('MISSING_SCOPE')
            expect(wrapped.hints?.[0]).toContain('--additional-scopes=backups')
            expect(wrapped.hints?.[0]).toContain('backups:read')
        }
    })

    it('preserves prior --read-only flag in the personalised re-login hint', async () => {
        mockGetAuthMetadata.mockResolvedValue({
            authMode: 'read-only',
            authFlags: ['read-only'],
            source: 'secure-store',
        })
        const wrapped = (await wrapApiError(scopeError(), 'getApps')) as CliError
        expect(wrapped.hints?.[0]).toContain('--read-only --additional-scopes=app-management')
    })

    it('preserves prior opt-in scopes alongside the newly required one', async () => {
        mockGetAuthMetadata.mockResolvedValue({
            authMode: 'read-write',
            authFlags: ['app-management'],
            source: 'secure-store',
        })
        const wrapped = (await wrapApiError(scopeError(), 'getBackups')) as CliError
        expect(wrapped.hints?.[0]).toContain('--additional-scopes=app-management,backups')
    })

    it('emits the generic re-auth hint for methods without a scope group (e.g. getTasks)', async () => {
        const wrapped = (await wrapApiError(scopeError(), 'getTasks')) as CliError
        expect(wrapped.code).toBe('MISSING_SCOPE')
        expect(wrapped.hints?.[0]).not.toContain('--additional-scopes')
        expect(wrapped.hints?.[0]).toContain('td auth login')
    })

    it('falls back to the standard hint when no method name is supplied', async () => {
        const wrapped = (await wrapApiError(scopeError())) as CliError
        expect(wrapped.code).toBe('MISSING_SCOPE')
        expect(wrapped.hints?.[0]).not.toContain('--additional-scopes')
    })

    it('falls through to AUTH_ERROR for a generic 403 without the scope tag', async () => {
        const error = new TodoistRequestError('HTTP 403: Forbidden', 403, { error: 'Forbidden' })

        const wrapped = await wrapApiError(error, 'getApps')

        expect(wrapped).toBeInstanceOf(CliError)
        expect((wrapped as CliError).code).toBe('AUTH_ERROR')
    })

    it('falls through to AUTH_ERROR for 403 with non-object responseData', async () => {
        const error = new TodoistRequestError('HTTP 403: Forbidden', 403, 'Forbidden')

        const wrapped = await wrapApiError(error, 'getApps')

        expect((wrapped as CliError).code).toBe('AUTH_ERROR')
    })

    it('does not match on non-403 statuses even with the scope tag in body', async () => {
        const error = new TodoistRequestError('HTTP 500: Internal Server Error', 500, {
            error_tag: 'AUTH_INSUFFICIENT_TOKEN_SCOPE',
        })

        const wrapped = await wrapApiError(error, 'getApps')

        expect((wrapped as CliError).code).toBe('API_ERROR')
    })
})
