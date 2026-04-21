import { TodoistRequestError } from '@doist/todoist-sdk'
import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/api/core.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../lib/api/core.js')>()
    return {
        ...actual,
        getApi: vi.fn(),
    }
})

vi.mock('../../lib/auth.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../lib/auth.js')>()
    return {
        ...actual,
        getAuthMetadata: vi.fn(),
    }
})

import { getApi, wrapApiError } from '../../lib/api/core.js'
import { getAuthMetadata } from '../../lib/auth.js'
import { CliError } from '../../lib/errors.js'
import { createMockApi, type MockApi } from '../../test-support/mock-api.js'
import { registerAppsCommand } from './index.js'

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
    clientId: 'client-abc',
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
    clientId: 'client-xyz',
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

    it('lists apps with displayName (id:N), Client ID, and a description line', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getApps.mockResolvedValue([APP_A, APP_B])

        await program.parseAsync(['node', 'td', 'apps', 'list'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Todoist for VS Code (id:9909)')
        expect(output).toContain('Client ID: client-abc')
        expect(output).toContain('Zapier Connector (id:9910)')
        expect(output).toContain('Client ID: client-xyz')
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
        expect(output).toContain('ID:                 9909')
        expect(output).toContain('Status:             public')
        expect(output).toContain('Users:              42')
        expect(output).toContain('Created:            2020-03-13')
        expect(output).toContain('Service URL:        http://localhost')
        expect(output).toContain('OAuth redirect:     vscode://doist.todoist-vs-code/auth-complete')
        expect(output).toContain('Token scopes:       data:read, data:read_write')
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
        expect(output).toContain('Service URL:        (none)')
        expect(output).toContain('OAuth redirect:     (none)')
        expect(output).toContain('Token scopes:       data:read')
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
        expect(output).toContain('ID:                 9909')
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
        expect(output).toContain('Service URL:        (none)')
        expect(output).toContain('OAuth redirect:     (none)')
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

describe('apps view — enriched fields', () => {
    let mockApi: MockApi

    const SECRETS = { clientId: 'client-abc', clientSecret: 'secret-def' }
    const VERIFICATION = { verificationToken: 'verify-ghi' }
    const DISTRIBUTION = { distributionToken: 'dist-jkl' }
    const WEBHOOK = {
        status: 'active' as const,
        callbackUrl: 'https://example.com/hook',
        version: '1' as const,
        events: ['item:added', 'item:completed'] as const,
    }

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)
        mockApi.getAppSecrets.mockResolvedValue(SECRETS)
        mockApi.getAppVerificationToken.mockResolvedValue(VERIFICATION)
        mockApi.getAppTestToken.mockResolvedValue({ accessToken: null })
        mockApi.getAppDistributionToken.mockResolvedValue(DISTRIBUTION)
        mockApi.getAppWebhook.mockResolvedValue(null)
    })

    it('only fetches webhook by default (no secret-bearing endpoints touched)', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'td', 'apps', 'view', 'id:9909'])

        expect(mockApi.getAppWebhook).toHaveBeenCalledWith('9909')
        // Secret-minimization: endpoints whose payload carries sensitive data
        // are never touched without --include-secrets. clientId is no longer
        // a reason to call getAppSecrets — it's on App directly now.
        expect(mockApi.getAppSecrets).not.toHaveBeenCalled()
        expect(mockApi.getAppVerificationToken).not.toHaveBeenCalled()
        expect(mockApi.getAppTestToken).not.toHaveBeenCalled()
        expect(mockApi.getAppDistributionToken).not.toHaveBeenCalled()
        consoleSpy.mockRestore()
    })

    it('fires all five enrichment calls with --include-secrets', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'td', 'apps', 'view', 'id:9909', '--include-secrets'])

        expect(mockApi.getAppSecrets).toHaveBeenCalledWith('9909')
        expect(mockApi.getAppVerificationToken).toHaveBeenCalledWith('9909')
        expect(mockApi.getAppTestToken).toHaveBeenCalledWith('9909')
        expect(mockApi.getAppDistributionToken).toHaveBeenCalledWith('9909')
        expect(mockApi.getAppWebhook).toHaveBeenCalledWith('9909')
        consoleSpy.mockRestore()
    })

    it('shows Client ID by default and hides the four sensitive credential lines', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'td', 'apps', 'view', 'id:9909'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        // Client ID is public (carried on App directly since SDK 9.3.0) —
        // always shown regardless of --include-secrets.
        expect(output).toContain('Client ID:          client-abc')
        expect(output).toContain('Client secret:      (hidden — pass --include-secrets to reveal)')
        expect(output).toContain('Verification token: (hidden — pass --include-secrets to reveal)')
        expect(output).toContain('Test token:         (hidden — pass --include-secrets to reveal)')
        expect(output).toContain('Distribution token: (hidden — pass --include-secrets to reveal)')
        // Raw secret strings must not appear
        expect(output).not.toContain('secret-def')
        expect(output).not.toContain('verify-ghi')
        expect(output).not.toContain('dist-jkl')
        // Webhook line is still shown (callback URL is user-supplied, not a secret)
        expect(output).toContain('Webhook:            (not configured)')
        consoleSpy.mockRestore()
    })

    it('reveals every sensitive value with --include-secrets', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getAppTestToken.mockResolvedValue({ accessToken: 'test-mno' })

        await program.parseAsync(['node', 'td', 'apps', 'view', 'id:9909', '--include-secrets'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Client ID:          client-abc')
        expect(output).toContain('Client secret:      secret-def')
        expect(output).toContain('Verification token: verify-ghi')
        expect(output).toContain('Test token:         test-mno')
        expect(output).toContain('Distribution token: dist-jkl')
        // No hidden placeholders remain
        expect(output).not.toContain('pass --include-secrets')
        consoleSpy.mockRestore()
    })

    it('renders webhook details when configured', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getAppWebhook.mockResolvedValue(WEBHOOK)

        await program.parseAsync(['node', 'td', 'apps', 'view', 'id:9909'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Webhook:            active — https://example.com/hook')
        expect(output).toContain('Webhook events:     item:added, item:completed')
        expect(output).toContain('Webhook version:    1')
        consoleSpy.mockRestore()
    })

    it('keeps (not created) for a null test token even with --include-secrets', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getAppTestToken.mockResolvedValue({ accessToken: null })

        await program.parseAsync(['node', 'td', 'apps', 'view', 'id:9909', '--include-secrets'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Test token:         (not created)')
        consoleSpy.mockRestore()
    })

    it('includes clientId but omits sensitive credential keys from --json by default', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getAppWebhook.mockResolvedValue(WEBHOOK)

        await program.parseAsync(['node', 'td', 'apps', 'view', 'id:9909', '--json'])

        const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string)
        // clientId is public — present by default (from App payload).
        expect(parsed.clientId).toBe('client-abc')
        // Sensitive keys must still be absent — not null or placeholder.
        expect(parsed).not.toHaveProperty('clientSecret')
        expect(parsed).not.toHaveProperty('verificationToken')
        expect(parsed).not.toHaveProperty('distributionToken')
        expect(parsed).not.toHaveProperty('testToken')
        expect(parsed.webhook).toMatchObject({
            status: 'active',
            callbackUrl: 'https://example.com/hook',
        })
        consoleSpy.mockRestore()
    })

    it('includes every sensitive field in --json --include-secrets', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getAppTestToken.mockResolvedValue({ accessToken: 'test-mno' })

        await program.parseAsync([
            'node',
            'td',
            'apps',
            'view',
            'id:9909',
            '--json',
            '--include-secrets',
        ])

        const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string)
        expect(parsed.clientId).toBe('client-abc')
        expect(parsed.clientSecret).toBe('secret-def')
        expect(parsed.verificationToken).toBe('verify-ghi')
        expect(parsed.distributionToken).toBe('dist-jkl')
        expect(parsed.testToken).toEqual({ accessToken: 'test-mno' })
        consoleSpy.mockRestore()
    })

    it('emits webhook: null in --json when the app has no webhook configured', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        await program.parseAsync(['node', 'td', 'apps', 'view', 'id:9909', '--json'])

        const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string)
        expect(parsed.webhook).toBeNull()
        consoleSpy.mockRestore()
    })
})

describe('apps update --add-oauth-redirect / --remove-oauth-redirect', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = createMockApi()
        mockGetApi.mockResolvedValue(mockApi)
    })

    it('errors when both --add- and --remove-oauth-redirect are passed', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync([
                'node',
                'td',
                'apps',
                'update',
                'id:9909',
                '--add-oauth-redirect',
                'https://example.com/cb',
                '--remove-oauth-redirect',
                'https://example.com/cb',
            ]),
        ).rejects.toMatchObject({ code: 'CONFLICTING_OPTIONS' })
        expect(mockApi.getApp).not.toHaveBeenCalled()
        expect(mockApi.updateApp).not.toHaveBeenCalled()
    })

    it('errors when neither flag is passed', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'td', 'apps', 'update', 'id:9909']),
        ).rejects.toMatchObject({ code: 'NO_CHANGES' })
        expect(mockApi.updateApp).not.toHaveBeenCalled()
    })

    it('rejects invalid redirect URIs before any API call', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync([
                'node',
                'td',
                'apps',
                'update',
                'id:9909',
                '--add-oauth-redirect',
                'javascript://alert(1)',
            ]),
        ).rejects.toMatchObject({ code: 'INVALID_URL' })
        expect(mockApi.getApp).not.toHaveBeenCalled()
        expect(mockApi.updateApp).not.toHaveBeenCalled()
    })

    it('adds a new redirect URI to an app that has one (serializes as JSON array)', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)
        mockApi.updateApp.mockResolvedValue({
            ...APP_A_DETAIL,
            oauthRedirectUri:
                '["vscode://doist.todoist-vs-code/auth-complete","https://example.com/cb"]',
        })

        await program.parseAsync([
            'node',
            'td',
            'apps',
            'update',
            'id:9909',
            '--add-oauth-redirect',
            'https://example.com/cb',
        ])

        expect(mockApi.updateApp).toHaveBeenCalledWith('9909', {
            oauthRedirectUri:
                '["vscode://doist.todoist-vs-code/auth-complete","https://example.com/cb"]',
        })
        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Added OAuth redirect URI to Todoist for VS Code')
        expect(output).toContain('https://example.com/cb')
        consoleSpy.mockRestore()
    })

    it('adds a first redirect URI to an app that has none (serializes as plain string)', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getApp.mockResolvedValue(APP_B_DETAIL)
        mockApi.updateApp.mockResolvedValue({
            ...APP_B_DETAIL,
            oauthRedirectUri: 'https://example.com/cb',
        })

        await program.parseAsync([
            'node',
            'td',
            'apps',
            'update',
            'id:9910',
            '--add-oauth-redirect',
            'https://example.com/cb',
        ])

        expect(mockApi.updateApp).toHaveBeenCalledWith('9910', {
            oauthRedirectUri: 'https://example.com/cb',
        })
        consoleSpy.mockRestore()
    })

    it('rejects adding a URI that is already set', async () => {
        const program = createProgram()

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)

        await expect(
            program.parseAsync([
                'node',
                'td',
                'apps',
                'update',
                'id:9909',
                '--add-oauth-redirect',
                'vscode://doist.todoist-vs-code/auth-complete',
            ]),
        ).rejects.toMatchObject({ code: 'ALREADY_EXISTS' })
        expect(mockApi.updateApp).not.toHaveBeenCalled()
    })

    it('add --dry-run previews without calling updateApp', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)

        await program.parseAsync([
            'node',
            'td',
            'apps',
            'update',
            'id:9909',
            '--add-oauth-redirect',
            'https://example.com/cb',
            '--dry-run',
        ])

        expect(mockApi.updateApp).not.toHaveBeenCalled()
        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('[dry-run]')
        expect(output).toContain('https://example.com/cb')
        consoleSpy.mockRestore()
    })

    it('remove exits without error when URI is not present on the app', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)

        await program.parseAsync([
            'node',
            'td',
            'apps',
            'update',
            'id:9909',
            '--remove-oauth-redirect',
            'https://not-on-app.example/cb',
            '--yes',
        ])

        expect(mockApi.updateApp).not.toHaveBeenCalled()
        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('is not an OAuth redirect URI')
        expect(output).toContain('nothing to remove')
        consoleSpy.mockRestore()
    })

    it('remove requires --yes; without it prints preview and does not call updateApp', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)

        await program.parseAsync([
            'node',
            'td',
            'apps',
            'update',
            'id:9909',
            '--remove-oauth-redirect',
            'vscode://doist.todoist-vs-code/auth-complete',
        ])

        expect(mockApi.updateApp).not.toHaveBeenCalled()
        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Would remove OAuth redirect URI')
        expect(output).toContain('Use --yes to confirm.')
        consoleSpy.mockRestore()
    })

    it('remove with --yes clears oauthRedirectUri to null when removing the only URI', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)
        mockApi.updateApp.mockResolvedValue({ ...APP_A_DETAIL, oauthRedirectUri: null })

        await program.parseAsync([
            'node',
            'td',
            'apps',
            'update',
            'id:9909',
            '--remove-oauth-redirect',
            'vscode://doist.todoist-vs-code/auth-complete',
            '--yes',
        ])

        expect(mockApi.updateApp).toHaveBeenCalledWith('9909', { oauthRedirectUri: null })
        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Removed OAuth redirect URI from Todoist for VS Code')
        consoleSpy.mockRestore()
    })

    it('remove with --yes writes the remaining URIs when multiple were set', async () => {
        const program = createProgram()
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        mockApi.getApp.mockResolvedValue({
            ...APP_A_DETAIL,
            oauthRedirectUri: '["https://a.example/cb","https://b.example/cb"]',
        })
        mockApi.updateApp.mockResolvedValue({
            ...APP_A_DETAIL,
            oauthRedirectUri: 'https://b.example/cb',
        })

        await program.parseAsync([
            'node',
            'td',
            'apps',
            'update',
            'id:9909',
            '--remove-oauth-redirect',
            'https://a.example/cb',
            '--yes',
        ])

        // Single remaining URI is written as a plain string, not a JSON array.
        expect(mockApi.updateApp).toHaveBeenCalledWith('9909', {
            oauthRedirectUri: 'https://b.example/cb',
        })
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
