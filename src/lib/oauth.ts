import { CliError } from './errors.js'
import { getRedirectUri } from './oauth-server.js'

const TODOIST_CLIENT_ID = '04863cc1e3584830a578622f50224d5b'
const OAUTH_AUTHORIZE_URL = 'https://todoist.com/oauth/authorize'
const OAUTH_TOKEN_URL = 'https://todoist.com/oauth/access_token'
export const READ_WRITE_SCOPES = 'data:read_write,data:delete,project:delete'
export const READ_ONLY_SCOPES = 'data:read'

export function buildAuthorizationUrl(
    codeChallenge: string,
    state: string,
    options: { readOnly?: boolean; port?: number } = {},
): string {
    const scope = options.readOnly ? READ_ONLY_SCOPES : READ_WRITE_SCOPES
    const redirectUri = options.port ? getRedirectUri(options.port) : getRedirectUri(8765)
    const params = new URLSearchParams({
        client_id: TODOIST_CLIENT_ID,
        scope,
        state: state,
        redirect_uri: redirectUri,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
    })
    return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

interface TokenResponse {
    access_token: string
    token_type: string
}

export async function exchangeCodeForToken(
    code: string,
    codeVerifier: string,
    port: number,
): Promise<string> {
    const body = new URLSearchParams({
        client_id: TODOIST_CLIENT_ID,
        code: code,
        code_verifier: codeVerifier,
        redirect_uri: getRedirectUri(port),
    })

    const response = await fetch(OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
    })

    if (!response.ok) {
        const text = await response.text()
        throw new CliError('AUTH_FAILED', `Token exchange failed: ${response.status} ${text}`)
    }

    const data: TokenResponse = await response.json()
    return data.access_token
}
