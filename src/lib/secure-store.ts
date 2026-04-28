const SERVICE_NAME = 'todoist-cli'

/**
 * Legacy single-user account name. Read once during migration to v2 storage,
 * then deleted. New code should always pass an explicit `user-<id>` account.
 */
export const LEGACY_ACCOUNT_NAME = 'api-token'

export const SECURE_STORE_DESCRIPTION = 'system credential manager'

export class SecureStoreUnavailableError extends Error {
    constructor(message = 'System credential storage is unavailable') {
        super(message)
        this.name = 'SecureStoreUnavailableError'
    }
}

export interface SecureStore {
    getSecret(): Promise<string | null>
    setSecret(secret: string): Promise<void>
    deleteSecret(): Promise<boolean>
}

/**
 * Build the keyring account name for a given Todoist user id.
 */
export function accountForUser(userId: string): string {
    return `user-${userId}`
}

/**
 * Create a secure-store handle for a specific keyring account. Pass the result
 * of `accountForUser(id)` for per-user tokens, or `LEGACY_ACCOUNT_NAME` when
 * reading/cleaning up the v1 single-user entry.
 */
export function createSecureStore(account: string = LEGACY_ACCOUNT_NAME): SecureStore {
    return {
        async getSecret(): Promise<string | null> {
            const entry = await getEntry(account)
            try {
                return (await entry.getPassword()) ?? null
            } catch (error) {
                throw toUnavailableError(error)
            }
        },

        async setSecret(secret: string): Promise<void> {
            const entry = await getEntry(account)
            try {
                await entry.setPassword(secret)
            } catch (error) {
                throw toUnavailableError(error)
            }
        },

        async deleteSecret(): Promise<boolean> {
            const entry = await getEntry(account)
            try {
                return await entry.deleteCredential()
            } catch (error) {
                throw toUnavailableError(error)
            }
        },
    }
}

async function getEntry(account: string): Promise<import('@napi-rs/keyring').AsyncEntry> {
    try {
        const { AsyncEntry } = await import('@napi-rs/keyring')
        return new AsyncEntry(SERVICE_NAME, account)
    } catch (error) {
        throw toUnavailableError(error)
    }
}

function toUnavailableError(error: unknown): SecureStoreUnavailableError {
    if (error instanceof SecureStoreUnavailableError) {
        return error
    }

    const message =
        error instanceof Error ? error.message : 'System credential storage is unavailable'
    return new SecureStoreUnavailableError(message)
}
