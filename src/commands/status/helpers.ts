import type { UserStatus } from '@doist/todoist-sdk'

/** The `{ status }` payload every status command prints with `--json`. */
export function formatStatusJson(status: UserStatus | null): string {
    return JSON.stringify({ status }, null, 2)
}
