import { type AuthProvider, createPkceProvider } from '@doist/cli-core/auth'
import { createApiForToken } from './api/core.js'
import type { TodoistAccount } from './auth-store.js'
import { type AuthFlag } from './config.js'
import { type AdditionalScopeFlag, parseScopesOption, resolveAuthScope } from './oauth-scopes.js'
import { fetchTodoist } from './usage-tracking.js'

const TODOIST_CLIENT_ID = '04863cc1e3584830a578622f50224d5b'
const OAUTH_AUTHORIZE_URL = 'https://todoist.com/oauth/authorize'
const OAUTH_TOKEN_URL = 'https://todoist.com/oauth/access_token'
// Todoist's PKCE verifier alphabet: RFC 7636 unreserved minus `~`. Keep this
// exact so existing tokens that interrogate the verifier continue to validate.
const TODOIST_VERIFIER_ALPHABET =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'

/**
 * Build an `AuthProvider<TodoistAccount>` driven by cli-core's PKCE factory.
 *
 * The wrapper only overrides `validateToken` — `runOAuthFlow` automatically
 * folds the runtime `flags` and `readOnly` values into the handshake
 * between `authorize` and `exchangeCode`/`validateToken`, so we read them
 * back out here to assemble the `auth_mode` / `auth_scope` / `auth_flags`
 * triplet that todoist persists per account.
 *
 * The token-endpoint POST is routed through `fetchTodoist` so the usage-
 * tracking headers (User-Agent, Doist-OS, …) are included.
 */
export function createTodoistAuthProvider(): AuthProvider<TodoistAccount> {
    return {
        ...createPkceProvider<TodoistAccount>({
            authorizeUrl: OAUTH_AUTHORIZE_URL,
            tokenUrl: OAUTH_TOKEN_URL,
            clientId: TODOIST_CLIENT_ID,
            scopeSeparator: ',',
            verifierAlphabet: TODOIST_VERIFIER_ALPHABET,
            verifierLength: 64,
            validate: async () => {
                // Replaced below — kept narrow so a regression surfaces here.
                throw new Error('createTodoistAuthProvider: validate() must be overridden')
            },
            fetchImpl: (input, init) => fetchTodoist(input as string | URL, init ?? {}),
        }),
        async validateToken({ token, handshake }) {
            const flags = (handshake.flags as Record<string, unknown> | undefined) ?? {}
            const readOnly = Boolean(handshake.readOnly)
            const additionalScopesRaw = flags.additionalScopes
            const additionalScopes: AdditionalScopeFlag[] =
                typeof additionalScopesRaw === 'string' && additionalScopesRaw.length > 0
                    ? parseScopesOption(additionalScopesRaw)
                    : []

            const probeApi = createApiForToken(token)
            const user = await probeApi.getUser()

            const authFlags: AuthFlag[] = []
            if (readOnly) authFlags.push('read-only')
            authFlags.push(...additionalScopes)

            return {
                id: user.id,
                email: user.email,
                label: user.email,
                auth_mode: readOnly ? 'read-only' : 'read-write',
                auth_scope: resolveAuthScope({ readOnly, additionalScopes }),
                auth_flags: authFlags.length > 0 ? authFlags : undefined,
            }
        },
    }
}
