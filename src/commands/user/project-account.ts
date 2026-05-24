import type { TodoistAccount } from '../../lib/auth-store.js'

/**
 * Shared `TodoistAccount` → CLI JSON projection used by `accounts list` and
 * `accounts current` so their per-account machine payloads can't drift. The
 * stored config keys (`auth_mode`, …) are flattened to the camelCase field
 * names the CLI has always surfaced; `label` (a duplicate of `email`) is
 * dropped. `accounts current` extends the result with a `source` field.
 */
export function projectAccount(account: TodoistAccount, isDefault: boolean) {
    return {
        id: account.id,
        email: account.email,
        isDefault,
        authMode: account.auth_mode,
        authScope: account.auth_scope,
        authFlags: account.auth_flags,
    }
}
