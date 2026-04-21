// URL validation + serialization for app OAuth redirect URIs.
//
// Mirrored from todoist-web so the CLI accepts the same set of URIs the web
// app editor does. Keep in sync with:
// src/settings/integrations/app-management/app-editor/helpers.ts in todoist-web.

const urlRegex = /^https:\/\/[^:/]+\.[a-zA-Z]{2,}(\/[^:]+)?$/
const localhostRegex = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/
const customSchemeRegex = /^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\/.+$/
const dangerousSchemes = new Set(['javascript', 'data', 'file', 'vbscript', 'http', 'https', 'ftp'])

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

    return trimmed
        .split(',')
        .map((u) => u.trim())
        .filter((u) => u.length > 0)
}

// Single URL is sent as a plain string; multiple as a JSON array. Matches the
// serialization todoist-web uses so both writers produce the same shape.
export function serializeOAuthRedirectUris(urls: string[]): string {
    if (urls.length <= 1) return urls[0] ?? ''
    return JSON.stringify(urls)
}
