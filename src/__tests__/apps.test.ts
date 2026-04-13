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

import { registerAppsCommand } from '../commands/apps/index.js'
import { getApi, wrapApiError } from '../lib/api/core.js'
import { CliError } from '../lib/errors.js'
import { createMockApi, type MockApi } from './helpers/mock-api.js'

const mockGetApi = vi.mocked(getApi)

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

describe('wrapApiError → MISSING_SCOPE detection', () => {
    it('converts 403 + AUTH_INSUFFICIENT_TOKEN_SCOPE into a MISSING_SCOPE CliError with --app-management hint', () => {
        const error = new TodoistRequestError('HTTP 403: Forbidden', 403, {
            error: 'Insufficient Token scope',
            error_code: 403,
            error_extra: { access_type: 'access_token' },
            error_tag: 'AUTH_INSUFFICIENT_TOKEN_SCOPE',
            http_code: 403,
        })

        const wrapped = wrapApiError(error)

        expect(wrapped).toBeInstanceOf(CliError)
        expect((wrapped as CliError).code).toBe('MISSING_SCOPE')
        expect((wrapped as CliError).hints?.some((h) => h.includes('--app-management'))).toBe(true)
    })

    it('falls through to AUTH_ERROR for a generic 403 without the scope tag', () => {
        const error = new TodoistRequestError('HTTP 403: Forbidden', 403, { error: 'Forbidden' })

        const wrapped = wrapApiError(error)

        expect(wrapped).toBeInstanceOf(CliError)
        expect((wrapped as CliError).code).toBe('AUTH_ERROR')
    })

    it('falls through to AUTH_ERROR for 403 with non-object responseData', () => {
        const error = new TodoistRequestError('HTTP 403: Forbidden', 403, 'Forbidden')

        const wrapped = wrapApiError(error)

        expect((wrapped as CliError).code).toBe('AUTH_ERROR')
    })

    it('does not match on non-403 statuses even with the scope tag in body', () => {
        const error = new TodoistRequestError('HTTP 500: Internal Server Error', 500, {
            error_tag: 'AUTH_INSUFFICIENT_TOKEN_SCOPE',
        })

        const wrapped = wrapApiError(error)

        expect((wrapped as CliError).code).toBe('API_ERROR')
    })
})
