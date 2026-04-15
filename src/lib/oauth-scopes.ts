import { AUTH_FLAG_ORDER, type AuthFlag } from './config.js'
import { CliError } from './errors.js'

/**
 * Additional OAuth scopes that can be requested on top of the base data grant
 * via `td auth login --additional-scopes=...`. `read-only` is intentionally
 * excluded — it swaps the base grant rather than adding to it.
 */
export type AdditionalScopeFlag = Exclude<AuthFlag, 'read-only'>

export interface ScopeDefinition {
    /** User-facing identifier used in --additional-scopes and in persisted auth_flags. */
    readonly flag: AdditionalScopeFlag
    /** Raw OAuth scope string sent to the Todoist authorize endpoint. */
    readonly oauthScope: string
    /** One-line summary shown in `td auth login --help`. */
    readonly summary: string
}

/**
 * Registry of opt-in OAuth scopes. Adding a new scope here is the only edit
 * needed to expose it via `--additional-scopes`, help output, and the
 * re-login remediation hints. Adding the same identifier to `AUTH_FLAG_ORDER`
 * in `config.ts` is the only other step.
 */
export const ADDITIONAL_SCOPES: readonly ScopeDefinition[] = [
    {
        flag: 'app-management',
        oauthScope: 'dev:app_console',
        summary: 'Manage your registered Todoist developer apps (rotate secrets, edit webhooks).',
    },
    {
        flag: 'backups',
        oauthScope: 'backups:read',
        summary: 'List and download your Todoist backups.',
    },
]

const ADDITIONAL_SCOPE_FLAGS: ReadonlySet<AdditionalScopeFlag> = new Set(
    ADDITIONAL_SCOPES.map((s) => s.flag),
)

export function isAdditionalScopeFlag(value: string): value is AdditionalScopeFlag {
    return ADDITIONAL_SCOPE_FLAGS.has(value as AdditionalScopeFlag)
}

export function oauthScopeFor(flag: AdditionalScopeFlag): string {
    const def = ADDITIONAL_SCOPES.find((s) => s.flag === flag)
    if (!def) {
        // Unreachable — the AdditionalScopeFlag type is derived from ADDITIONAL_SCOPES.
        throw new Error(`Unknown additional scope: ${flag}`)
    }
    return def.oauthScope
}

/**
 * Parse a comma-separated `--additional-scopes` value into an ordered,
 * de-duplicated list of scope flags. Emits a canonical order matching
 * `AUTH_FLAG_ORDER` (so persisted `auth_flags` stays stable regardless of
 * user input order). Throws `CliError('INVALID_OPTIONS')` on empty entries
 * or unknown scope names.
 */
export function parseScopesOption(raw: string): AdditionalScopeFlag[] {
    const parts = raw
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0)

    if (parts.length === 0) {
        throw new CliError(
            'INVALID_OPTIONS',
            '--additional-scopes requires at least one scope name.',
            [`Valid scopes: ${ADDITIONAL_SCOPES.map((s) => s.flag).join(', ')}`],
        )
    }

    const unknown = parts.filter((p) => !isAdditionalScopeFlag(p))
    if (unknown.length > 0) {
        throw new CliError(
            'INVALID_OPTIONS',
            `Unknown scope${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`,
            [`Valid scopes: ${ADDITIONAL_SCOPES.map((s) => s.flag).join(', ')}`],
        )
    }

    const seen = new Set<AdditionalScopeFlag>(parts as AdditionalScopeFlag[])
    return AUTH_FLAG_ORDER.filter(
        (f): f is AdditionalScopeFlag => f !== 'read-only' && seen.has(f as AdditionalScopeFlag),
    )
}

/**
 * Render the `Available scopes / Examples` block appended to
 * `td auth login --help` via `.addHelpText('after', ...)`.
 */
export function formatScopesHelp(): string {
    const maxFlagLength = Math.max(...ADDITIONAL_SCOPES.map((s) => s.flag.length))
    const scopeLines = ADDITIONAL_SCOPES.map(
        (s) => `  ${s.flag.padEnd(maxFlagLength)}  ${s.summary}`,
    ).join('\n')

    return `
Available scopes (comma-separated for --additional-scopes):
${scopeLines}

Examples:
  td auth login
  td auth login --read-only
  td auth login --additional-scopes=app-management
  td auth login --read-only --additional-scopes=backups
  td auth login --additional-scopes=app-management,backups`
}
