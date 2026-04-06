import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TEST_HOME = '/tmp/todoist-cli-tests'
const TEST_CONFIG_PATH = `${TEST_HOME}/.config/todoist-cli/config.json`

interface KeyringState {
    token: string | null
    getError?: Error
    setError?: Error
    deleteError?: Error
    getCalls: number
    service?: string
    account?: string
    setCalls: string[]
    deleteCalls: number
}

describe('lib/auth', () => {
    let configContent: string | null
    let configUnlinkError: Error | null
    let configWriteError: Error | null
    let mkdirMock: ReturnType<typeof vi.fn>
    let readFileMock: ReturnType<typeof vi.fn>
    let unlinkMock: ReturnType<typeof vi.fn>
    let writeFileMock: ReturnType<typeof vi.fn>
    let keyringState: KeyringState
    let errorSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.resetModules()
        vi.clearAllMocks()
        vi.unstubAllEnvs()

        configContent = null
        configUnlinkError = null
        configWriteError = null
        keyringState = {
            token: null,
            getCalls: 0,
            setCalls: [],
            deleteCalls: 0,
        }

        mkdirMock = vi.fn().mockResolvedValue(undefined)
        readFileMock = vi.fn().mockImplementation(async () => {
            if (configContent === null) {
                throw createErrnoError('ENOENT')
            }
            return configContent
        })
        unlinkMock = vi.fn().mockImplementation(async () => {
            if (configUnlinkError) {
                throw configUnlinkError
            }
            if (configContent === null) {
                throw createErrnoError('ENOENT')
            }
            configContent = null
        })
        writeFileMock = vi.fn().mockImplementation(async (_path: string, content: string) => {
            if (configWriteError) {
                throw configWriteError
            }
            configContent = content
        })

        vi.doMock('node:os', () => ({
            homedir: () => TEST_HOME,
        }))

        vi.doMock('node:fs/promises', () => ({
            chmod: vi.fn().mockResolvedValue(undefined),
            mkdir: mkdirMock,
            readFile: readFileMock,
            unlink: unlinkMock,
            writeFile: writeFileMock,
        }))

        vi.doMock('@napi-rs/keyring', () => ({
            AsyncEntry: class {
                constructor(service: string, account: string) {
                    keyringState.service = service
                    keyringState.account = account
                }

                async getPassword(): Promise<string | null> {
                    keyringState.getCalls += 1
                    if (keyringState.getError) {
                        throw keyringState.getError
                    }
                    return keyringState.token
                }

                async setPassword(password: string): Promise<void> {
                    if (keyringState.setError) {
                        throw keyringState.setError
                    }
                    keyringState.token = password
                    keyringState.setCalls.push(password)
                }

                async deleteCredential(): Promise<boolean> {
                    if (keyringState.deleteError) {
                        throw keyringState.deleteError
                    }
                    const hadCredential = keyringState.token !== null
                    keyringState.token = null
                    keyringState.deleteCalls += 1
                    return hadCredential
                }
            },
        }))

        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        errorSpy.mockRestore()
        vi.unstubAllEnvs()
    })

    it('prefers TODOIST_API_TOKEN over secure storage and config', async () => {
        vi.stubEnv('TODOIST_API_TOKEN', 'env-token-123456')
        keyringState.token = 'secure-token-abcdef'
        setConfig({ api_token: 'config-token-xyz', currentWorkspace: 'personal' })

        const { getApiToken } = await import('../lib/auth.js')

        await expect(getApiToken()).resolves.toBe('env-token-123456')
        expect(readFileMock).not.toHaveBeenCalled()
        expect(keyringState.service).toBeUndefined()
    })

    it('reads and writes tokens through secure storage when available', async () => {
        const { clearApiToken, getApiToken, saveApiToken } = await import('../lib/auth.js')

        await expect(saveApiToken('secure-token-123456')).resolves.toEqual({
            storage: 'secure-store',
        })
        expect(keyringState.token).toBe('secure-token-123456')
        expect(keyringState.service).toBe('todoist-cli')
        expect(keyringState.account).toBe('api-token')

        await expect(getApiToken()).resolves.toBe('secure-token-123456')

        setConfig({ currentWorkspace: 'work', api_token: 'legacy-token' })
        await expect(clearApiToken()).resolves.toEqual({ storage: 'secure-store' })
        expect(keyringState.token).toBeNull()
        expect(readConfig()).toEqual({ currentWorkspace: 'work' })
    })

    it('persists auth metadata in config when saving to secure store', async () => {
        const { saveApiToken } = await import('../lib/auth.js')

        await saveApiToken('secure-token-123456', {
            authMode: 'read-only',
            authScope: 'data:read',
        })

        expect(keyringState.token).toBe('secure-token-123456')
        expect(readConfig()).toEqual({
            auth_mode: 'read-only',
            auth_scope: 'data:read',
        })
    })

    it('persists auth metadata in config when falling back to config file', async () => {
        keyringState.setError = new Error('Keychain unavailable')

        const { saveApiToken } = await import('../lib/auth.js')

        await saveApiToken('fallback-token-123456', {
            authMode: 'read-write',
            authScope: 'data:read_write,data:delete,project:delete',
        })

        expect(readConfig()).toEqual({
            api_token: 'fallback-token-123456',
            auth_mode: 'read-write',
            auth_scope: 'data:read_write,data:delete,project:delete',
        })
    })

    it('clears auth metadata on logout', async () => {
        keyringState.token = 'secure-token-123456'
        setConfig({
            auth_mode: 'read-only',
            auth_scope: 'data:read',
            currentWorkspace: 'work',
        })

        const { clearApiToken } = await import('../lib/auth.js')

        await clearApiToken()

        expect(readConfig()).toEqual({ currentWorkspace: 'work' })
    })

    it('returns unknown auth mode for env token', async () => {
        vi.stubEnv('TODOIST_API_TOKEN', 'env-token-123456')

        const { getAuthMetadata } = await import('../lib/auth.js')

        await expect(getAuthMetadata()).resolves.toEqual({
            authMode: 'unknown',
            source: 'env',
        })
    })

    it('reads auth metadata from config', async () => {
        keyringState.token = 'secure-token-123456'
        setConfig({
            auth_mode: 'read-only',
            auth_scope: 'data:read',
        })

        const { getAuthMetadata } = await import('../lib/auth.js')

        await expect(getAuthMetadata()).resolves.toEqual({
            authMode: 'read-only',
            authScope: 'data:read',
            source: 'secure-store',
        })
    })

    it('returns unknown auth mode when no metadata stored', async () => {
        keyringState.token = 'secure-token-123456'

        const { getAuthMetadata } = await import('../lib/auth.js')

        await expect(getAuthMetadata()).resolves.toEqual({
            authMode: 'unknown',
            source: 'secure-store',
        })
    })

    it('probes a legacy config token without migrating it', async () => {
        setConfig({
            api_token: 'legacy-token-123456',
            auth_mode: 'read-write',
            currentWorkspace: 'team-1',
        })

        const { probeApiToken } = await import('../lib/auth.js')

        await expect(probeApiToken()).resolves.toEqual({
            token: 'legacy-token-123456',
            metadata: {
                authMode: 'read-write',
                source: 'config-file',
            },
        })
        expect(keyringState.setCalls).toEqual([])
        expect(readConfig()).toEqual({
            api_token: 'legacy-token-123456',
            auth_mode: 'read-write',
            currentWorkspace: 'team-1',
        })
    })

    it('probes a secure-store token without mutating config', async () => {
        keyringState.token = 'secure-token-123456'
        setConfig({
            auth_mode: 'read-only',
            auth_scope: 'data:read',
            currentWorkspace: 'team-1',
        })

        const { probeApiToken } = await import('../lib/auth.js')

        await expect(probeApiToken()).resolves.toEqual({
            token: 'secure-token-123456',
            metadata: {
                authMode: 'read-only',
                authScope: 'data:read',
                source: 'secure-store',
            },
        })
        expect(keyringState.getCalls).toBe(1)
        expect(readConfig()).toEqual({
            auth_mode: 'read-only',
            auth_scope: 'data:read',
            currentWorkspace: 'team-1',
        })
    })

    it('migrates a plaintext config token into secure storage and preserves other config', async () => {
        setConfig({
            api_token: 'legacy-token-123456',
            currentWorkspace: 'team-1',
            theme: 'compact',
        })

        const { getApiToken } = await import('../lib/auth.js')

        await expect(getApiToken()).resolves.toBe('legacy-token-123456')
        expect(keyringState.setCalls).toEqual(['legacy-token-123456'])
        expect(keyringState.token).toBe('legacy-token-123456')
        expect(readConfig()).toEqual({
            currentWorkspace: 'team-1',
            theme: 'compact',
        })
    })

    it('prefers a fallback config token over a stale secure-store token', async () => {
        keyringState.token = 'stale-secure-token-123456'
        setConfig({
            api_token: 'fallback-token-123456',
            currentWorkspace: 'team-1',
        })

        const { getApiToken } = await import('../lib/auth.js')

        await expect(getApiToken()).resolves.toBe('fallback-token-123456')
        expect(keyringState.getCalls).toBe(0)
        expect(keyringState.setCalls).toEqual(['fallback-token-123456'])
        expect(keyringState.token).toBe('fallback-token-123456')
        expect(readConfig()).toEqual({ currentWorkspace: 'team-1' })
    })

    it('returns the migrated token even when config cleanup fails after secure-store write', async () => {
        configUnlinkError = new Error('EACCES')
        setConfig({ api_token: 'legacy-token-123456' })

        const { getApiToken } = await import('../lib/auth.js')

        await expect(getApiToken()).resolves.toBe('legacy-token-123456')
        expect(keyringState.setCalls).toEqual(['legacy-token-123456'])
        expect(errorSpy).toHaveBeenCalledWith(
            `Warning: Token was migrated to secure storage, but could not remove legacy plaintext token from ${TEST_CONFIG_PATH} (EACCES)`,
        )
        expect(readConfig()).toEqual({ api_token: 'legacy-token-123456' })
    })

    it('falls back to plaintext config with a warning when secure storage is unavailable', async () => {
        keyringState.getError = new Error('Keychain unavailable')
        keyringState.setError = new Error('Keychain unavailable')
        keyringState.deleteError = new Error('Keychain unavailable')

        const { clearApiToken, getApiToken, saveApiToken } = await import('../lib/auth.js')

        await expect(saveApiToken('fallback-token-123456')).resolves.toEqual({
            storage: 'config-file',
            warning: `system credential manager unavailable; token saved as plaintext in ${TEST_CONFIG_PATH}`,
        })
        expect(readConfig()).toEqual({ api_token: 'fallback-token-123456' })

        await expect(getApiToken()).resolves.toBe('fallback-token-123456')
        expect(errorSpy).not.toHaveBeenCalled()

        setConfig({
            api_token: 'fallback-token-123456',
            currentWorkspace: 'team-2',
        })
        await expect(clearApiToken()).resolves.toEqual({
            storage: 'config-file',
            warning: `system credential manager unavailable; local auth state cleared in ${TEST_CONFIG_PATH}`,
        })
        expect(readConfig()).toEqual({
            currentWorkspace: 'team-2',
            pendingSecureStoreClear: true,
        })
    })

    it('removes plaintext tokens after secure-store save while preserving non-secret config', async () => {
        setConfig({
            api_token: 'old-token-123456',
            currentWorkspace: 'workspace-1',
        })

        const { saveApiToken } = await import('../lib/auth.js')

        await expect(saveApiToken('new-token-123456')).resolves.toEqual({
            storage: 'secure-store',
        })
        expect(keyringState.token).toBe('new-token-123456')
        // auth_mode and auth_scope are undefined when no options passed, so not written to config
        expect(readConfig()).toEqual({ currentWorkspace: 'workspace-1' })
    })

    it('keeps secure-store success when plaintext cleanup fails after save', async () => {
        configWriteError = new Error('EACCES')
        setConfig({
            api_token: 'old-token-123456',
            currentWorkspace: 'workspace-1',
        })

        const { saveApiToken } = await import('../lib/auth.js')

        await expect(saveApiToken('new-token-123456')).resolves.toEqual({
            storage: 'secure-store',
            warning: `Token was stored securely, but could not remove legacy plaintext token from ${TEST_CONFIG_PATH} (EACCES)`,
        })
        expect(keyringState.token).toBe('new-token-123456')
        expect(readConfig()).toEqual({
            api_token: 'old-token-123456',
            currentWorkspace: 'workspace-1',
        })
    })

    it('keeps secure-store success when plaintext cleanup fails after logout', async () => {
        configWriteError = new Error('EACCES')
        keyringState.token = 'secure-token-123456'
        setConfig({
            api_token: 'old-token-123456',
            currentWorkspace: 'workspace-1',
        })

        const { clearApiToken } = await import('../lib/auth.js')

        await expect(clearApiToken()).resolves.toEqual({
            storage: 'secure-store',
            warning: `Secure-store token was removed, but could not remove legacy plaintext token from ${TEST_CONFIG_PATH} (EACCES)`,
        })
        expect(keyringState.token).toBeNull()
        expect(readConfig()).toEqual({
            api_token: 'old-token-123456',
            currentWorkspace: 'workspace-1',
        })
    })

    it('clears pending secure-store deletion when fallback save writes a new token', async () => {
        keyringState.setError = new Error('Keychain unavailable')
        setConfig({
            currentWorkspace: 'workspace-1',
            pendingSecureStoreClear: true,
        })

        const { saveApiToken } = await import('../lib/auth.js')

        await expect(saveApiToken('fallback-token-123456')).resolves.toEqual({
            storage: 'config-file',
            warning: `system credential manager unavailable; token saved as plaintext in ${TEST_CONFIG_PATH}`,
        })
        expect(readConfig()).toEqual({
            api_token: 'fallback-token-123456',
            currentWorkspace: 'workspace-1',
        })
    })

    it('treats pending secure-store deletion as logged out and clears stale secure tokens', async () => {
        keyringState.token = 'stale-secure-token-123456'
        setConfig({
            currentWorkspace: 'workspace-1',
            pendingSecureStoreClear: true,
        })

        const { getApiToken } = await import('../lib/auth.js')

        const { NoTokenError } = await import('../lib/auth.js')
        await expect(getApiToken()).rejects.toBeInstanceOf(NoTokenError)
        expect(keyringState.deleteCalls).toBe(1)
        expect(keyringState.getCalls).toBe(0)
        expect(keyringState.token).toBeNull()
        expect(readConfig()).toEqual({ currentWorkspace: 'workspace-1' })
    })

    function setConfig(config: Record<string, unknown>): void {
        configContent = `${JSON.stringify(config, null, 2)}\n`
    }

    function readConfig(): Record<string, unknown> | null {
        return configContent ? (JSON.parse(configContent) as Record<string, unknown>) : null
    }

    function createErrnoError(code: string): Error & { code: string } {
        const error = new Error(code) as Error & { code: string }
        error.code = code
        return error
    }
})
