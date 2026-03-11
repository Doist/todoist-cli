const SERVICE_NAME = 'todoist-cli'
const ACCOUNT_NAME = 'api-token'

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

export function createSecureStore(): SecureStore {
    return {
        async getSecret(): Promise<string | null> {
            const entry = await getEntry()
            try {
                return (await entry.getPassword()) ?? null
            } catch (error) {
                throw toUnavailableError(error)
            }
        },

        async setSecret(secret: string): Promise<void> {
            const entry = await getEntry()
            try {
                await entry.setPassword(secret)
            } catch (error) {
                throw toUnavailableError(error)
            }
        },

        async deleteSecret(): Promise<boolean> {
            const entry = await getEntry()
            try {
                return await entry.deleteCredential()
            } catch (error) {
                throw toUnavailableError(error)
            }
        },
    }
}

async function getEntry(): Promise<import('@napi-rs/keyring').AsyncEntry> {
    try {
        const { AsyncEntry } = await import('@napi-rs/keyring')
        return new AsyncEntry(SERVICE_NAME, ACCOUNT_NAME)
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
