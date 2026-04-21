// URL validation + serialization for app OAuth redirect URIs.
// Mirrored from the todoist-web app editor so the CLI accepts the same set
// of URIs the web UI does.

const urlRegex = /^https:\/\/[^:/]+\.[a-zA-Z]{2,}(\/[^:]+)?$/
const localhostRegex = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/
const customSchemeRegex = /^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\/.+$/
// `http` and `https` are listed here as a backstop for the custom-scheme
// branch: well-formed http/https URLs are accepted earlier via `urlRegex`
// (https) or `localhostRegex` (http(s)://localhost), so anything reaching
// `customSchemeRegex` with an http/https scheme is malformed (e.g. multiple
// URLs concatenated with a comma) and should be rejected, not waved through.
const dangerousSchemes = new Set(['javascript', 'data', 'file', 'vbscript', 'ftp', 'http', 'https'])

function validateIntegrationUrl(url: string): boolean {
    if (!urlRegex.test(url)) return false
    try {
        new URL(url)
        return true
    } catch {
        return false
    }
}

export function validateRedirectUri(url: string): boolean {
    if (localhostRegex.test(url)) {
        try {
            new URL(url)
            return true
        } catch {
            return false
        }
    }
    if (validateIntegrationUrl(url)) return true
    if (customSchemeRegex.test(url)) {
        const scheme = url.split('://')[0].toLowerCase()
        return !dangerousSchemes.has(scheme)
    }
    return false
}

// Backend stores oauth_redirect_uri as either a JSON-array string, a plain
// string, or a legacy comma-separated string. Accept all three on read.
export function parseOAuthRedirectUris(uri: string | null): string[] {
    if (!uri) return []
    const trimmed = uri.trim()
    if (!trimmed) return []

    if (trimmed.startsWith('[')) {
        try {
            const parsed: unknown = JSON.parse(trimmed)
            if (Array.isArray(parsed)) {
                return parsed.filter(
                    (item): item is string => typeof item === 'string' && item.length > 0,
                )
            }
        } catch {
            // Fall through to comma-separated parsing.
        }
    }

    // A single valid URL may legitimately contain commas in a query string
    // (e.g. https://example.com/cb?xs=1,2,3). Treat the whole string as one
    // URI when it validates as such, instead of shredding it on commas.
    if (validateRedirectUri(trimmed)) {
        return [trimmed]
    }

    return trimmed
        .split(',')
        .map((u) => u.trim())
        .filter((u) => u.length > 0)
}

// Single URL is sent as a plain string; multiple as a JSON array. Matches the
// serialization the web app uses so both writers produce the same shape.
export function serializeOAuthRedirectUris(urls: string[]): string {
    if (urls.length <= 1) return urls[0] ?? ''
    return JSON.stringify(urls)
}
