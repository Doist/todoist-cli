import {
    captureConsole,
    createTestProgram,
    describeEmptyMachineOutput,
} from '@doist/cli-core/testing'
import { TodoistRequestError } from '@doist/todoist-sdk'
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

import { wrapApiError } from '../../lib/api/core.js'
import { getAuthMetadata } from '../../lib/auth.js'
import { CliError } from '../../lib/errors.js'
import { setupApiMock } from '../../test-support/api-mock.js'
import { type MockApi } from '../../test-support/mock-api.js'
import { registerAppsCommand } from './index.js'

const mockGetAuthMetadata = vi.mocked(getAuthMetadata)

function createProgram() {
    return createTestProgram(registerAppsCommand)
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
        mockApi = setupApiMock()
    })

    it('lists apps with displayName (id:N), Client ID, and a description line', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getApps.mockResolvedValue([APP_A, APP_B])

        await program.parseAsync(['node', 'td', 'apps', 'list'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Todoist for VS Code (id:9909)')
        expect(output).toContain('Client ID: client-abc')
        expect(output).toContain('Zapier Connector (id:9910)')
        expect(output).toContain('Client ID: client-xyz')
        // App B has no description → fallback string
        expect(output).toContain('(no description)')
    })

    describeEmptyMachineOutput('empty machine output contract', {
        setup: () => {
            mockApi.getApps.mockResolvedValue([])
        },
        run: async (extraArgs) => {
            const program = createProgram()
            await program.parseAsync(['node', 'td', 'apps', 'list', ...extraArgs])
        },
        humanMessage: 'No apps found.',
    })

    it('outputs full JSON with --json flag', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getApps.mockResolvedValue([APP_A])

        await program.parseAsync(['node', 'td', 'apps', 'list', '--json'])

        const output = consoleSpy.mock.calls[0][0] as string
        const parsed = JSON.parse(output)
        expect(Array.isArray(parsed)).toBe(true)
        expect(parsed[0].id).toBe('9909')
        expect(parsed[0].displayName).toBe('Todoist for VS Code')
        expect(parsed[0].oauthRedirectUri).toBe('vscode://doist.todoist-vs-code/auth-complete')
    })

    it('outputs NDJSON with --ndjson flag', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getApps.mockResolvedValue([APP_A, APP_B])

        await program.parseAsync(['node', 'td', 'apps', 'list', '--ndjson'])

        const output = consoleSpy.mock.calls[0][0] as string
        const lines = output.split('\n')
        expect(lines).toHaveLength(2)
        expect(JSON.parse(lines[0]).id).toBe('9909')
        expect(JSON.parse(lines[1]).id).toBe('9910')
    })
})

describe('apps view', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('resolves id:N directly via getApp without listing', async () => {
        const program = createProgram()
        captureConsole()

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)

        await program.parseAsync(['node', 'td', 'apps', 'view', 'id:9909'])

        expect(mockApi.getApp).toHaveBeenCalledWith('9909')
        expect(mockApi.getApps).not.toHaveBeenCalled()
    })

    it('resolves a raw numeric id via getApp directly (no listing roundtrip)', async () => {
        const program = createProgram()
        captureConsole()

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)

        await program.parseAsync(['node', 'td', 'apps', 'view', '9909'])

        expect(mockApi.getApp).toHaveBeenCalledWith('9909')
        expect(mockApi.getApps).not.toHaveBeenCalled()
    })

    it('resolves a name via fuzzy match then re-fetches via getApp to enrich with userCount', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

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
    })

    it('does not call getApp twice on id:N (no redundant detail fetch)', async () => {
        const program = createProgram()
        captureConsole()

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)

        await program.parseAsync(['node', 'td', 'apps', 'view', 'id:9909'])

        expect(mockApi.getApp).toHaveBeenCalledTimes(1)
    })

    it('shows fallback strings for null fields and (none) for empty token scopes', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getApp.mockResolvedValue(APP_B_DETAIL)

        await program.parseAsync(['node', 'td', 'apps', 'view', 'id:9910'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Service URL:        (none)')
        expect(output).toContain('OAuth redirect:     (none)')
        expect(output).toContain('Token scopes:       data:read')
        expect(output).toContain('(no description)')
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
        const consoleSpy = captureConsole()

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)

        await program.parseAsync(['node', 'td', 'apps', 'id:9909'])

        expect(mockApi.getApp).toHaveBeenCalledWith('9909')
        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Todoist for VS Code')
        expect(output).toContain('ID:                 9909')
    })

    it('does not attempt getApp() for alphanumeric refs (avoids the 400 from the apps endpoint)', async () => {
        const program = createProgram()

        mockApi.getApps.mockResolvedValue([APP_A])

        await expect(
            program.parseAsync(['node', 'td', 'apps', 'view', 'doesnotexist-xyz123']),
        ).rejects.toMatchObject({ code: 'APP_NOT_FOUND' })
        expect(mockApi.getApp).not.toHaveBeenCalled()
    })

    it('renders a multi-URI JSON-array oauthRedirectUri as separate indented lines', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getApp.mockResolvedValue({
            ...APP_A_DETAIL,
            oauthRedirectUri: '["https://a.example/cb","https://b.example/cb"]',
        })

        await program.parseAsync(['node', 'td', 'apps', 'view', 'id:9909'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('OAuth redirect:     https://a.example/cb')
        // Continuation line aligns with the value column (22-space indent).
        expect(output).toContain('                      https://b.example/cb')
        // Raw JSON-array blob should not leak into the plain renderer.
        expect(output).not.toContain('["https://a.example/cb"')
    })

    it('treats empty-string serviceUrl/oauthRedirectUri the same as null', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getApp.mockResolvedValue({
            ...APP_A_DETAIL,
            serviceUrl: '',
            oauthRedirectUri: '',
        })

        await program.parseAsync(['node', 'td', 'apps', 'view', 'id:9909'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Service URL:        (none)')
        expect(output).toContain('OAuth redirect:     (none)')
    })

    it('outputs full JSON of AppWithUserCount with --json', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)

        await program.parseAsync(['node', 'td', 'apps', 'view', 'id:9909', '--json'])

        const output = consoleSpy.mock.calls[0][0] as string
        const parsed = JSON.parse(output)
        expect(parsed.id).toBe('9909')
        expect(parsed.userCount).toBe(42)
        expect(parsed.appTokenScopes).toEqual(['data:read', 'data:read_write'])
    })

    it('outputs single-line JSON with --ndjson', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)

        await program.parseAsync(['node', 'td', 'apps', 'view', 'id:9909', '--ndjson'])

        const output = consoleSpy.mock.calls[0][0] as string
        expect(output.split('\n')).toHaveLength(1)
        expect(JSON.parse(output).id).toBe('9909')
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
        mockApi = setupApiMock()
        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)
        mockApi.getAppSecrets.mockResolvedValue(SECRETS)
        mockApi.getAppVerificationToken.mockResolvedValue(VERIFICATION)
        mockApi.getAppTestToken.mockResolvedValue({ accessToken: null })
        mockApi.getAppDistributionToken.mockResolvedValue(DISTRIBUTION)
        mockApi.getAppWebhook.mockResolvedValue(null)
    })

    it('fetches webhook and UI extensions but defers the distribution token when the app has no extensions', async () => {
        const program = createProgram()
        captureConsole()

        // Default mock: getUiExtensionsForApp resolves to []
        await program.parseAsync(['node', 'td', 'apps', 'view', 'id:9909'])

        expect(mockApi.getAppWebhook).toHaveBeenCalledWith('9909')
        expect(mockApi.getUiExtensionsForApp).toHaveBeenCalledWith('9909')
        // No UI extensions in plain output → no install URL → skip the avoidable call.
        expect(mockApi.getAppDistributionToken).not.toHaveBeenCalled()
        // Secret-minimization: endpoints whose payload carries genuinely sensitive
        // data are never touched without --include-secrets.
        expect(mockApi.getAppSecrets).not.toHaveBeenCalled()
        expect(mockApi.getAppVerificationToken).not.toHaveBeenCalled()
        expect(mockApi.getAppTestToken).not.toHaveBeenCalled()
    })

    it('fetches the distribution token in plain output once the app has UI extensions', async () => {
        const program = createProgram()
        captureConsole()

        mockApi.getUiExtensionsForApp.mockResolvedValue([
            makeUiExtension('Settings panel', { extensionType: 'settings' }),
        ])

        await program.parseAsync(['node', 'td', 'apps', 'view', 'id:9909'])

        expect(mockApi.getAppDistributionToken).toHaveBeenCalledWith('9909')
    })

    it('fetches the distribution token for --json even without UI extensions', async () => {
        const program = createProgram()
        captureConsole()

        await program.parseAsync(['node', 'td', 'apps', 'view', 'id:9909', '--json'])

        expect(mockApi.getAppDistributionToken).toHaveBeenCalledWith('9909')
    })

    it('fires the secret enrichment calls with --include-secrets', async () => {
        const program = createProgram()
        captureConsole()

        await program.parseAsync(['node', 'td', 'apps', 'view', 'id:9909', '--include-secrets'])

        expect(mockApi.getAppSecrets).toHaveBeenCalledWith('9909')
        expect(mockApi.getAppVerificationToken).toHaveBeenCalledWith('9909')
        expect(mockApi.getAppTestToken).toHaveBeenCalledWith('9909')
        expect(mockApi.getAppWebhook).toHaveBeenCalledWith('9909')
        // The distribution token is no longer a secret; --include-secrets does not
        // pull it in. It is fetched only for the install URL / JSON payload.
        expect(mockApi.getAppDistributionToken).not.toHaveBeenCalled()
    })

    it('shows Client ID by default and hides the three sensitive credential lines', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync(['node', 'td', 'apps', 'view', 'id:9909'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        // Client ID is public (carried on App directly since SDK 9.3.0) —
        // always shown regardless of --include-secrets.
        expect(output).toContain('Client ID:          client-abc')
        expect(output).toContain('Client secret:      (hidden — pass --include-secrets to reveal)')
        expect(output).toContain('Verification token: (hidden — pass --include-secrets to reveal)')
        expect(output).toContain('Test token:         (hidden — pass --include-secrets to reveal)')
        // Distribution token is no longer a secret — no hidden placeholder for it.
        expect(output).not.toContain('Distribution token:')
        // Raw secret strings must not appear
        expect(output).not.toContain('secret-def')
        expect(output).not.toContain('verify-ghi')
        // Webhook line is still shown (callback URL is user-supplied, not a secret)
        expect(output).toContain('Webhook:            (not configured)')
    })

    it('reveals every sensitive value with --include-secrets', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getAppTestToken.mockResolvedValue({ accessToken: 'test-mno' })

        await program.parseAsync(['node', 'td', 'apps', 'view', 'id:9909', '--include-secrets'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Client ID:          client-abc')
        expect(output).toContain('Client secret:      secret-def')
        expect(output).toContain('Verification token: verify-ghi')
        expect(output).toContain('Test token:         test-mno')
        // No hidden placeholders remain
        expect(output).not.toContain('pass --include-secrets')
    })

    it('renders webhook details when configured', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getAppWebhook.mockResolvedValue(WEBHOOK)

        await program.parseAsync(['node', 'td', 'apps', 'view', 'id:9909'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Webhook:            active — https://example.com/hook')
        expect(output).toContain('Webhook events:     item:added, item:completed')
        expect(output).toContain('Webhook version:    1')
    })

    it('keeps (not created) for a null test token even with --include-secrets', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getAppTestToken.mockResolvedValue({ accessToken: null })

        await program.parseAsync(['node', 'td', 'apps', 'view', 'id:9909', '--include-secrets'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Test token:         (not created)')
    })

    it('includes clientId but omits sensitive credential keys from --json by default', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getAppWebhook.mockResolvedValue(WEBHOOK)

        await program.parseAsync(['node', 'td', 'apps', 'view', 'id:9909', '--json'])

        const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string)
        // clientId is public — present by default (from App payload).
        expect(parsed.clientId).toBe('client-abc')
        // distributionToken is non-secret — always present (drives the install URL).
        expect(parsed.distributionToken).toBe('dist-jkl')
        // Sensitive keys must still be absent — not null or placeholder.
        expect(parsed).not.toHaveProperty('clientSecret')
        expect(parsed).not.toHaveProperty('verificationToken')
        expect(parsed).not.toHaveProperty('testToken')
        expect(parsed.webhook).toMatchObject({
            status: 'active',
            callbackUrl: 'https://example.com/hook',
        })
    })

    it('includes every sensitive field in --json --include-secrets', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

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
    })

    it('emits webhook: null in --json when the app has no webhook configured', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync(['node', 'td', 'apps', 'view', 'id:9909', '--json'])

        const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string)
        expect(parsed.webhook).toBeNull()
    })

    // These tests only care about name + type + subtype; the rest of the SDK shape is
    // boilerplate, so a tiny helper keeps each case focused on the fields under test.
    function makeUiExtension(
        name: string,
        variant:
            | { extensionType: 'settings' }
            | { extensionType: 'context-menu'; contextType: 'project' | 'task' }
            | { extensionType: 'composer'; composerType: 'task' | 'comment' },
    ) {
        return {
            id: name,
            integrationId: '9909',
            extensionId: name,
            url: 'https://example.com',
            icon: null,
            name,
            description: '',
            width: null,
            height: null,
            defVersion: 1,
            minimumCardistVersion: '0.1',
            ...variant,
        }
    }

    const UI_EXTENSIONS = [
        makeUiExtension('Settings panel', { extensionType: 'settings' }),
        makeUiExtension('Project action', {
            extensionType: 'context-menu',
            contextType: 'project',
        }),
        makeUiExtension('Task composer', { extensionType: 'composer', composerType: 'task' }),
    ]

    it('lists UI extensions (with sub-types) and the install URL when the app has them', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getUiExtensionsForApp.mockResolvedValue(UI_EXTENSIONS)

        await program.parseAsync(['node', 'td', 'apps', 'view', 'id:9909'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('UI extensions:      Settings panel (settings)')
        expect(output).toContain('Project action (context-menu: project)')
        expect(output).toContain('Task composer (composer: task)')
        expect(output).toContain('Install URL:        https://app.todoist.com/app/install/dist-jkl')
    })

    it('omits the UI extensions section and install URL when the app has none', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        // Default mock: getUiExtensionsForApp resolves to []
        await program.parseAsync(['node', 'td', 'apps', 'view', 'id:9909'])

        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).not.toContain('UI extensions:')
        expect(output).not.toContain('Install URL:')
    })

    it('carries uiExtensions, distributionToken, and installUrl in --json', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getUiExtensionsForApp.mockResolvedValue(UI_EXTENSIONS)

        await program.parseAsync(['node', 'td', 'apps', 'view', 'id:9909', '--json'])

        const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string)
        expect(parsed.uiExtensions).toHaveLength(3)
        expect(parsed.distributionToken).toBe('dist-jkl')
        expect(parsed.installUrl).toBe('https://app.todoist.com/app/install/dist-jkl')
    })

    it('sets installUrl null in --json when the app has no UI extensions', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        await program.parseAsync(['node', 'td', 'apps', 'view', 'id:9909', '--json'])

        const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string)
        expect(parsed.uiExtensions).toEqual([])
        expect(parsed.installUrl).toBeNull()
    })
})

describe('apps update --add-oauth-redirect / --remove-oauth-redirect', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
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

    it('rejects invalid redirect URIs on --add before any API call', async () => {
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

    it('does not validate the URI on --remove (lets users clean up legacy malformed data)', async () => {
        const program = createProgram()
        captureConsole()

        // App's stored URI is malformed but we want to let the user remove it.
        mockApi.getApp.mockResolvedValue({
            ...APP_A_DETAIL,
            oauthRedirectUri: 'javascript://alert(1)',
        })
        mockApi.updateApp.mockResolvedValue({ ...APP_A_DETAIL, oauthRedirectUri: null })

        await program.parseAsync([
            'node',
            'td',
            'apps',
            'update',
            'id:9909',
            '--remove-oauth-redirect',
            'javascript://alert(1)',
            '--yes',
        ])

        expect(mockApi.updateApp).toHaveBeenCalledWith('9909', { oauthRedirectUri: null })
    })

    it('adds a new redirect URI to an app that has one (serializes as JSON array)', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

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
        expect(output).toContain('Updated Todoist for VS Code')
        expect(output).toContain('added OAuth redirect URI')
        expect(output).toContain('https://example.com/cb')
    })

    it('adds a first redirect URI to an app that has none (serializes as plain string)', async () => {
        const program = createProgram()
        captureConsole()

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
        const consoleSpy = captureConsole()

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
    })

    it('remove exits without error when URI is not present on the app', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

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
    })

    it('remove no-op with --json outputs the unchanged app as JSON', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

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
            '--json',
        ])

        expect(mockApi.updateApp).not.toHaveBeenCalled()
        const output = consoleSpy.mock.calls[0][0] as string
        const parsed = JSON.parse(output)
        expect(parsed.id).toBe('9909')
        expect(parsed.oauthRedirectUri).toBe('vscode://doist.todoist-vs-code/auth-complete')
    })

    it('remove without --yes and with --json throws CONFIRMATION_REQUIRED instead of printing a preview', async () => {
        const program = createProgram()

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)

        await expect(
            program.parseAsync([
                'node',
                'td',
                'apps',
                'update',
                'id:9909',
                '--remove-oauth-redirect',
                'vscode://doist.todoist-vs-code/auth-complete',
                '--json',
            ]),
        ).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED' })
        expect(mockApi.updateApp).not.toHaveBeenCalled()
    })

    it('remove requires --yes; without it prints preview and does not call updateApp', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

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
        expect(output).toContain('Would update Todoist for VS Code')
        expect(output).toContain('removed OAuth redirect URI')
        expect(output).toContain('Use --yes to confirm.')
    })

    it('remove with --yes clears oauthRedirectUri to null when removing the only URI', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

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
        expect(output).toContain('Updated Todoist for VS Code')
        expect(output).toContain('removed OAuth redirect URI')
    })

    it('add with --json outputs only the essential app fields via the shared formatter', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

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
            '--json',
        ])

        const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string)
        expect(parsed.id).toBe('9909')
        expect(parsed.clientId).toBe('client-abc')
        expect(parsed.displayName).toBe('Todoist for VS Code')
        expect(parsed.oauthRedirectUri).toContain('https://example.com/cb')
        expect(parsed.userCount).toBe(42)
        // Essential-fields filter drops noisy/secondary keys.
        expect(parsed).not.toHaveProperty('iconSm')
        expect(parsed).not.toHaveProperty('userId')
    })

    it('remove with --yes writes the remaining URIs when multiple were set', async () => {
        const program = createProgram()
        captureConsole()

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
    })
})

describe('apps update --set-webhook-url', () => {
    let mockApi: MockApi

    const WEBHOOK = {
        status: 'active' as const,
        callbackUrl: 'https://old.example.com/webhook',
        version: '1' as const,
        events: ['item:added', 'item:completed'] as const,
    }

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('swaps the callback URL, preserving the existing events and version', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)
        mockApi.getAppWebhook.mockResolvedValue(WEBHOOK)
        mockApi.updateAppWebhook.mockResolvedValue({
            ...WEBHOOK,
            callbackUrl: 'https://new.example.com/webhook',
        })

        await program.parseAsync([
            'node',
            'td',
            'apps',
            'update',
            'id:9909',
            '--set-webhook-url',
            'https://new.example.com/webhook',
        ])

        expect(mockApi.updateAppWebhook).toHaveBeenCalledWith({
            appId: '9909',
            callbackUrl: 'https://new.example.com/webhook',
            events: WEBHOOK.events,
            version: '1',
        })
        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Updated Todoist for VS Code')
        expect(output).toContain('set webhook URL')
        expect(output).toContain('https://new.example.com/webhook')
    })

    it('outputs the updated webhook as JSON with --json', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)
        mockApi.getAppWebhook.mockResolvedValue(WEBHOOK)
        mockApi.updateAppWebhook.mockResolvedValue({
            ...WEBHOOK,
            callbackUrl: 'https://new.example.com/webhook',
        })

        await program.parseAsync([
            'node',
            'td',
            'apps',
            'update',
            'id:9909',
            '--set-webhook-url',
            'https://new.example.com/webhook',
            '--json',
        ])

        const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string)
        expect(parsed.callbackUrl).toBe('https://new.example.com/webhook')
        expect(parsed.events).toEqual(['item:added', 'item:completed'])
    })

    it('errors with NO_WEBHOOK when the app has no webhook configured', async () => {
        const program = createProgram()

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)
        mockApi.getAppWebhook.mockResolvedValue(null)

        await expect(
            program.parseAsync([
                'node',
                'td',
                'apps',
                'update',
                'id:9909',
                '--set-webhook-url',
                'https://new.example.com/webhook',
            ]),
        ).rejects.toMatchObject({ code: 'NO_WEBHOOK' })
        expect(mockApi.updateAppWebhook).not.toHaveBeenCalled()
    })

    it('rejects an invalid webhook URL before any API call', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync([
                'node',
                'td',
                'apps',
                'update',
                'id:9909',
                '--set-webhook-url',
                'http://localhost/webhook',
            ]),
        ).rejects.toMatchObject({ code: 'INVALID_URL' })
        expect(mockApi.getApp).not.toHaveBeenCalled()
        expect(mockApi.updateAppWebhook).not.toHaveBeenCalled()
    })

    it('is a no-op when the URL already matches the configured callback', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)
        mockApi.getAppWebhook.mockResolvedValue(WEBHOOK)

        await program.parseAsync([
            'node',
            'td',
            'apps',
            'update',
            'id:9909',
            '--set-webhook-url',
            'https://old.example.com/webhook',
        ])

        expect(mockApi.updateAppWebhook).not.toHaveBeenCalled()
        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('already set to')
    })

    it('same-URL no-op with --json outputs the unchanged webhook as JSON', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)
        mockApi.getAppWebhook.mockResolvedValue(WEBHOOK)

        await program.parseAsync([
            'node',
            'td',
            'apps',
            'update',
            'id:9909',
            '--set-webhook-url',
            'https://old.example.com/webhook',
            '--json',
        ])

        expect(mockApi.updateAppWebhook).not.toHaveBeenCalled()
        const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string)
        expect(parsed.callbackUrl).toBe('https://old.example.com/webhook')
    })

    it('--dry-run previews without calling updateAppWebhook', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)
        mockApi.getAppWebhook.mockResolvedValue(WEBHOOK)

        await program.parseAsync([
            'node',
            'td',
            'apps',
            'update',
            'id:9909',
            '--set-webhook-url',
            'https://new.example.com/webhook',
            '--dry-run',
        ])

        expect(mockApi.updateAppWebhook).not.toHaveBeenCalled()
        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('[dry-run]')
        expect(output).toContain('https://new.example.com/webhook')
    })

    it('combines with an OAuth-redirect flag, patching the record then swapping the webhook', async () => {
        const program = createProgram()
        captureConsole()

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)
        mockApi.getAppWebhook.mockResolvedValue(WEBHOOK)
        mockApi.updateApp.mockResolvedValue({
            ...APP_A_DETAIL,
            oauthRedirectUri:
                '["vscode://doist.todoist-vs-code/auth-complete","https://example.com/cb"]',
        })
        mockApi.updateAppWebhook.mockResolvedValue({
            ...WEBHOOK,
            callbackUrl: 'https://new.example.com/webhook',
        })

        await program.parseAsync([
            'node',
            'td',
            'apps',
            'update',
            'id:9909',
            '--set-webhook-url',
            'https://new.example.com/webhook',
            '--add-oauth-redirect',
            'https://example.com/cb',
        ])

        expect(mockApi.updateApp).toHaveBeenCalledWith('9909', {
            oauthRedirectUri:
                '["vscode://doist.todoist-vs-code/auth-complete","https://example.com/cb"]',
        })
        expect(mockApi.updateAppWebhook).toHaveBeenCalledWith({
            appId: '9909',
            callbackUrl: 'https://new.example.com/webhook',
            events: WEBHOOK.events,
            version: '1',
        })
    })
})

describe('apps update --name / --description (and combined)', () => {
    let mockApi: MockApi

    const WEBHOOK = {
        status: 'active' as const,
        callbackUrl: 'https://old.example.com/webhook',
        version: '1' as const,
        events: ['item:added', 'item:completed'] as const,
    }

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('sets the display name', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)
        mockApi.updateApp.mockResolvedValue({ ...APP_A_DETAIL, displayName: 'Renamed App' })

        await program.parseAsync([
            'node',
            'td',
            'apps',
            'update',
            'id:9909',
            '--name',
            'Renamed App',
        ])

        expect(mockApi.updateApp).toHaveBeenCalledWith('9909', { displayName: 'Renamed App' })
        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Updated Todoist for VS Code')
        expect(output).toContain('set name to "Renamed App"')
    })

    it('sets the description', async () => {
        const program = createProgram()
        captureConsole()

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)
        mockApi.updateApp.mockResolvedValue({ ...APP_A_DETAIL, description: 'New blurb' })

        await program.parseAsync([
            'node',
            'td',
            'apps',
            'update',
            'id:9909',
            '--description',
            'New blurb',
        ])

        expect(mockApi.updateApp).toHaveBeenCalledWith('9909', { description: 'New blurb' })
    })

    it('clears the description with an empty string', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)
        mockApi.updateApp.mockResolvedValue({ ...APP_A_DETAIL, description: '' })

        await program.parseAsync(['node', 'td', 'apps', 'update', 'id:9909', '--description', ''])

        expect(mockApi.updateApp).toHaveBeenCalledWith('9909', { description: '' })
        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('cleared description')
    })

    it('sets name and description together in a single updateApp patch', async () => {
        const program = createProgram()
        captureConsole()

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)
        mockApi.updateApp.mockResolvedValue({
            ...APP_A_DETAIL,
            displayName: 'Renamed App',
            description: 'New blurb',
        })

        await program.parseAsync([
            'node',
            'td',
            'apps',
            'update',
            'id:9909',
            '--name',
            'Renamed App',
            '--description',
            'New blurb',
        ])

        expect(mockApi.updateApp).toHaveBeenCalledWith('9909', {
            displayName: 'Renamed App',
            description: 'New blurb',
        })
    })

    it('rejects an empty display name before any API call', async () => {
        const program = createProgram()

        await expect(
            program.parseAsync(['node', 'td', 'apps', 'update', 'id:9909', '--name', '   ']),
        ).rejects.toMatchObject({ code: 'INVALID_OPTIONS' })
        expect(mockApi.getApp).not.toHaveBeenCalled()
        expect(mockApi.updateApp).not.toHaveBeenCalled()
    })

    it('combines --name with --add-oauth-redirect in one updateApp patch', async () => {
        const program = createProgram()
        captureConsole()

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)
        mockApi.updateApp.mockResolvedValue({
            ...APP_A_DETAIL,
            displayName: 'Renamed App',
            oauthRedirectUri:
                '["vscode://doist.todoist-vs-code/auth-complete","https://example.com/cb"]',
        })

        await program.parseAsync([
            'node',
            'td',
            'apps',
            'update',
            'id:9909',
            '--name',
            'Renamed App',
            '--add-oauth-redirect',
            'https://example.com/cb',
        ])

        expect(mockApi.updateApp).toHaveBeenCalledWith('9909', {
            displayName: 'Renamed App',
            oauthRedirectUri:
                '["vscode://doist.todoist-vs-code/auth-complete","https://example.com/cb"]',
        })
    })

    it('combines --name with --set-webhook-url and emits { app, webhook } JSON', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)
        mockApi.getAppWebhook.mockResolvedValue(WEBHOOK)
        mockApi.updateApp.mockResolvedValue({ ...APP_A_DETAIL, displayName: 'Renamed App' })
        mockApi.updateAppWebhook.mockResolvedValue({
            ...WEBHOOK,
            callbackUrl: 'https://new.example.com/webhook',
        })

        await program.parseAsync([
            'node',
            'td',
            'apps',
            'update',
            'id:9909',
            '--name',
            'Renamed App',
            '--set-webhook-url',
            'https://new.example.com/webhook',
            '--json',
        ])

        expect(mockApi.updateApp).toHaveBeenCalledWith('9909', { displayName: 'Renamed App' })
        expect(mockApi.updateAppWebhook).toHaveBeenCalledWith({
            appId: '9909',
            callbackUrl: 'https://new.example.com/webhook',
            events: WEBHOOK.events,
            version: '1',
        })
        const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string)
        expect(parsed.app.id).toBe('9909')
        expect(parsed.app.displayName).toBe('Renamed App')
        expect(parsed.webhook.callbackUrl).toBe('https://new.example.com/webhook')
    })

    it('withholds the whole batch when a real removal lacks --yes (plain preview)', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)

        await program.parseAsync([
            'node',
            'td',
            'apps',
            'update',
            'id:9909',
            '--name',
            'Renamed App',
            '--remove-oauth-redirect',
            'vscode://doist.todoist-vs-code/auth-complete',
        ])

        expect(mockApi.updateApp).not.toHaveBeenCalled()
        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Would update Todoist for VS Code')
        expect(output).toContain('set name to "Renamed App"')
        expect(output).toContain('removed OAuth redirect URI')
        expect(output).toContain('Use --yes to confirm.')
    })

    it('withholds the whole batch when a real removal lacks --yes (--json throws)', async () => {
        const program = createProgram()

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)

        await expect(
            program.parseAsync([
                'node',
                'td',
                'apps',
                'update',
                'id:9909',
                '--name',
                'Renamed App',
                '--remove-oauth-redirect',
                'vscode://doist.todoist-vs-code/auth-complete',
                '--json',
            ]),
        ).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED' })
        expect(mockApi.updateApp).not.toHaveBeenCalled()
    })

    it('combined --dry-run previews every change without any API call', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)
        mockApi.getAppWebhook.mockResolvedValue(WEBHOOK)

        await program.parseAsync([
            'node',
            'td',
            'apps',
            'update',
            'id:9909',
            '--name',
            'Renamed App',
            '--description',
            'New blurb',
            '--set-webhook-url',
            'https://new.example.com/webhook',
            '--dry-run',
        ])

        expect(mockApi.updateApp).not.toHaveBeenCalled()
        expect(mockApi.updateAppWebhook).not.toHaveBeenCalled()
        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('[dry-run]')
        expect(output).toContain('Renamed App')
        expect(output).toContain('New blurb')
        expect(output).toContain('https://new.example.com/webhook')
    })
})

describe('apps delete', () => {
    let mockApi: MockApi

    beforeEach(() => {
        vi.clearAllMocks()
        mockApi = setupApiMock()
    })

    it('deletes the app with --yes', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)
        mockApi.deleteApp.mockResolvedValue(true)

        await program.parseAsync(['node', 'td', 'apps', 'delete', 'id:9909', '--yes'])

        expect(mockApi.deleteApp).toHaveBeenCalledWith('9909')
        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Deleted: Todoist for VS Code (id:9909)')
    })

    it('without --yes prints a preview and does not call deleteApp', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)

        await program.parseAsync(['node', 'td', 'apps', 'delete', 'id:9909'])

        expect(mockApi.deleteApp).not.toHaveBeenCalled()
        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('Would delete app: Todoist for VS Code (id:9909)')
        expect(output).toContain('Use --yes to confirm.')
    })

    it('--dry-run previews without calling deleteApp', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)

        await program.parseAsync(['node', 'td', 'apps', 'delete', 'id:9909', '--dry-run'])

        expect(mockApi.deleteApp).not.toHaveBeenCalled()
        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('[dry-run]')
        expect(output).toContain('Todoist for VS Code')
    })

    it('--dry-run wins over --yes: previews and never deletes', async () => {
        const program = createProgram()
        const consoleSpy = captureConsole()

        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)

        await program.parseAsync(['node', 'td', 'apps', 'delete', 'id:9909', '--dry-run', '--yes'])

        // --dry-run takes precedence even when confirmation is present —
        // a destructive delete must not fire.
        expect(mockApi.deleteApp).not.toHaveBeenCalled()
        const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(output).toContain('[dry-run]')
        expect(output).not.toContain('Deleted:')
    })

    it('resolves an app by name before deleting', async () => {
        const program = createProgram()
        captureConsole()

        mockApi.getApps.mockResolvedValue([APP_A, APP_B])
        mockApi.getApp.mockResolvedValue(APP_A_DETAIL)
        mockApi.deleteApp.mockResolvedValue(true)

        await program.parseAsync(['node', 'td', 'apps', 'delete', 'Todoist for VS Code', '--yes'])

        expect(mockApi.deleteApp).toHaveBeenCalledWith('9909')
    })

    it('throws APP_NOT_FOUND for an unknown app and never calls deleteApp', async () => {
        const program = createProgram()

        mockApi.getApps.mockResolvedValue([APP_A])

        await expect(
            program.parseAsync(['node', 'td', 'apps', 'delete', 'nope', '--yes']),
        ).rejects.toMatchObject({ code: 'APP_NOT_FOUND' })
        expect(mockApi.deleteApp).not.toHaveBeenCalled()
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

    it('emits the app-management hint for app-management methods (read and write)', async () => {
        for (const method of ['getApps', 'getApp', 'updateApp', 'deleteApp']) {
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
