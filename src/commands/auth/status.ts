import { formatJson, formatNdjson } from '@doist/cli-core'
import { attachStatusCommand } from '@doist/cli-core/auth'
import chalk from 'chalk'
import type { Command } from 'commander'
import { getApi } from '../../lib/api/core.js'
import { type TodoistAccount, type TodoistTokenStore } from '../../lib/auth-store.js'
import {
    type AuthMetadata,
    type AuthMode,
    getAuthMetadata,
    listStoredUsers,
    readConfig,
    type StoredUser,
} from '../../lib/auth.js'
import { getDefaultUserId } from '../../lib/users.js'

type StatusData = {
    user: { id: string; email: string; fullName: string }
    metadata: AuthMetadata
    storedUsers: StoredUser[]
    defaultUserId: string | undefined
}

function formatAuthMode(authMode: AuthMode, authScope?: string): string {
    if (authMode === 'read-only') {
        return `read-only (OAuth scope ${authScope ?? 'data:read'})`
    }
    if (authMode === 'read-write') {
        return 'read-write'
    }
    return 'unknown (manual token or env var; assuming write access)'
}

async function gatherStatusData(): Promise<StatusData> {
    const api = await getApi()
    const [user, metadata, storedUsers, config] = await Promise.all([
        api.getUser(),
        getAuthMetadata(),
        listStoredUsers(),
        readConfig(),
    ])
    return { user, metadata, storedUsers, defaultUserId: getDefaultUserId(config) }
}

function buildStatusText(data: StatusData): readonly string[] {
    const { user, metadata, storedUsers, defaultUserId } = data
    const modeLabel = formatAuthMode(metadata.authMode, metadata.authScope)

    // env source wins over default: when running with TODOIST_API_TOKEN,
    // showing `(default)` would hide the more important "this is an env
    // override, not your stored credential" signal.
    const defaultMarker =
        metadata.source === 'env'
            ? ' (TODOIST_API_TOKEN)'
            : defaultUserId === user.id
              ? ' (default)'
              : ''

    const lines: string[] = [
        `${chalk.green('✓')} Authenticated${defaultMarker}`,
        `  Email: ${user.email}`,
        `  Name:  ${user.fullName}`,
        `  Mode:  ${modeLabel}`,
    ]

    const others = storedUsers.filter((u) => u.id !== user.id)
    if (others.length > 0) {
        lines.push('')
        lines.push(chalk.dim(`Other stored accounts (${others.length}):`))
        for (const other of others) {
            const marker = other.id === defaultUserId ? chalk.dim(' (default)') : ''
            lines.push(`  ${other.email} ${chalk.dim(`(id:${other.id})`)}${marker}`)
        }
        lines.push(
            chalk.dim(
                'Use `td user use <id|email>` to switch default, or `--user <ref>` per command.',
            ),
        )
    }
    return lines
}

function buildStatusJson(data: StatusData): unknown {
    const { user, metadata, storedUsers, defaultUserId } = data
    return {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        authMode: metadata.authMode,
        authScope: metadata.authScope,
        authFlags: metadata.authFlags,
        source: metadata.source,
        isDefault: defaultUserId === user.id,
        storedUsers: storedUsers.map((u) => ({
            id: u.id,
            email: u.email,
            isDefault: defaultUserId === u.id,
        })),
    }
}

/**
 * Attach `td auth status` via cli-core's generic `attachStatusCommand`.
 *
 * `TodoistTokenStore.active()` returns `null` for env-token mode + when no
 * default user is stored (per the adapter's documented contract — see
 * `auth-store.ts`). To preserve the existing UX for those cases we route the
 * full status fetch through `onNotAuthenticated`; when `active()` does return
 * a snapshot, `fetchLive` covers the same gather so renderText/renderJson can
 * read from a single closure-captured `StatusData` regardless of which path
 * we took. The same gather (`gatherStatusData`) is reused so output is
 * byte-for-byte identical between paths.
 */
export function attachTodoistStatusCommand(auth: Command, store: TodoistTokenStore): Command {
    let data: StatusData | null = null

    return attachStatusCommand<TodoistAccount>(auth, {
        store,
        description: 'Show current authentication status',
        fetchLive: async ({ account }) => {
            data = await gatherStatusData()
            return {
                ...account,
                email: data.user.email,
                auth_mode: data.metadata.authMode,
                auth_scope: data.metadata.authScope,
                auth_flags: data.metadata.authFlags,
            }
        },
        renderText: () => {
            if (!data) throw new Error('status renderText called before fetchLive')
            return buildStatusText(data)
        },
        renderJson: () => {
            if (!data) throw new Error('status renderJson called before fetchLive')
            return buildStatusJson(data)
        },
        onNotAuthenticated: async ({ view }) => {
            // active() returned null — either env-token mode, --user selector,
            // or no default. Drive the legacy resolver (getApi) so all three
            // paths render identically; getApi throws NoTokenError /
            // UserNotFoundError when nothing resolves, matching prior UX.
            data = await gatherStatusData()
            if (view.json) {
                console.log(formatJson(buildStatusJson(data)))
                return
            }
            if (view.ndjson) {
                console.log(formatNdjson([buildStatusJson(data)]))
                return
            }
            for (const line of buildStatusText(data)) console.log(line)
        },
    })
}
