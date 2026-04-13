import type { AuthFlag, AuthMetadata } from './auth.js'

// Canonical order so the suggested command reads the same way every time,
// regardless of the order flags were originally passed.
const FLAG_ORDER: readonly AuthFlag[] = ['read-only', 'app-management', 'backups']

/**
 * Build a `td auth login …` command string that preserves the user's prior
 * flag choices and adds whichever extra scope flag is now required.
 *
 * When `metadata.authFlags` is missing (older configs, env-var tokens,
 * manual `td auth token` logins) we treat it as "no flags" — the base login.
 */
export function buildReloginCommand(metadata: AuthMetadata, requiredFlag: AuthFlag): string {
    const existing = metadata.authFlags ?? []
    const merged = new Set<AuthFlag>([...existing, requiredFlag])
    const orderedFlags = FLAG_ORDER.filter((flag) => merged.has(flag))
    return `td auth login ${orderedFlags.map((flag) => `--${flag}`).join(' ')}`
}
