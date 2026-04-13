import type { AuthMetadata } from './auth.js'
import { AUTH_FLAG_ORDER, type AuthFlag } from './config.js'

/**
 * Build a `td auth login …` command string that preserves the user's prior
 * flag choices and adds whichever extra scope flag is now required.
 *
 * Flags render in the canonical order defined by `AUTH_FLAG_ORDER` — that
 * same list is the type/validator source of truth in `config.ts`, so a
 * newly added flag automatically flows into the ordering here without a
 * separate update.
 *
 * When `metadata.authFlags` is missing (older configs, env-var tokens,
 * manual `td auth token` logins) we treat it as "no flags" — the base login.
 */
export function buildReloginCommand(metadata: AuthMetadata, requiredFlag: AuthFlag): string {
    const existing = metadata.authFlags ?? []
    const merged = new Set<AuthFlag>([...existing, requiredFlag])
    const orderedFlags = AUTH_FLAG_ORDER.filter((flag) => merged.has(flag))
    return `td auth login ${orderedFlags.map((flag) => `--${flag}`).join(' ')}`
}
