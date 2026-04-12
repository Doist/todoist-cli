import { WORKSPACE_ROLES as SDK_WORKSPACE_ROLES, type WorkspaceUser } from '@doist/todoist-sdk'
import { getApi } from '../../lib/api/core.js'
import type { Workspace } from '../../lib/api/workspaces.js'
import { CliError } from '../../lib/errors.js'
import { extractId, isIdRef } from '../../lib/refs.js'

// Widen the SDK's readonly tuple to `readonly string[]` so callers can use
// `.includes(someString)` and spread into mutable arrays without casts.
export const WORKSPACE_ROLES: readonly string[] = SDK_WORKSPACE_ROLES

/**
 * Curated JSON shape for a workspace, matching the output of
 * `workspace view --json` / `workspace list --json`. Used by create/update
 * so scripts that round-trip through these commands see a consistent
 * contract regardless of which operation produced the payload.
 */
export function formatWorkspaceJson(
    workspace: Workspace,
    full: boolean,
): Workspace | Record<string, unknown> {
    if (full) return workspace
    return {
        id: workspace.id,
        name: workspace.name,
        plan: workspace.plan,
        role: workspace.role,
        domainName: workspace.domainName,
        memberCount: workspace.currentMemberCount,
        projectCount: workspace.currentActiveProjects,
    }
}

/**
 * Throws `NOT_ADMIN` if the current user is not an ADMIN of the workspace.
 * Safe to call before a `--dry-run` early return so non-admins fail loudly
 * even when previewing.
 */
export function assertWorkspaceAdmin(workspace: Workspace, action: string): void {
    if (workspace.role === 'ADMIN') return
    const role = workspace.role ?? 'none'
    throw new CliError(
        'NOT_ADMIN',
        `Only workspace admins can ${action} '${workspace.name}' (your role: ${role}).`,
        ['Ask a workspace admin to perform this action.'],
    )
}

/**
 * Resolves a workspace user reference (id:xxx, raw id, email, or full name)
 * to a `WorkspaceUser` by paginating `getWorkspaceUsers` for the workspace.
 * Matches are: (1) exact id, (2) exact email (case-insensitive),
 * (3) exact fullName (case-insensitive), (4) substring in fullName or email.
 * Ambiguous fuzzy matches throw; exact matches always win.
 */
export async function resolveWorkspaceUserRef(
    workspaceId: string,
    ref: string,
): Promise<WorkspaceUser> {
    const api = await getApi()

    if (isIdRef(ref)) {
        const id = extractId(ref)
        const user = await findUser(workspaceId, (u) => u.userId === id)
        if (user) return user
        throw new CliError('NOT_FOUND', `No user with id "${id}" found in workspace.`, [
            'Use `td workspace users <workspace>` to list members.',
        ])
    }

    // Collect all workspace users once, then match.
    const users: WorkspaceUser[] = []
    let cursor: string | undefined
    while (true) {
        const response = await api.getWorkspaceUsers({
            workspaceId,
            cursor,
            limit: 200,
        })
        users.push(...response.workspaceUsers)
        if (!response.hasMore || !response.nextCursor) break
        cursor = response.nextCursor
    }

    const lower = ref.toLowerCase()
    const exactId = users.find((u) => u.userId === ref)
    if (exactId) return exactId
    const exactEmail = users.find((u) => u.userEmail.toLowerCase() === lower)
    if (exactEmail) return exactEmail
    const exactName = users.find((u) => u.fullName.toLowerCase() === lower)
    if (exactName) return exactName

    const fuzzy = users.filter(
        (u) =>
            u.fullName.toLowerCase().includes(lower) || u.userEmail.toLowerCase().includes(lower),
    )
    if (fuzzy.length === 1) return fuzzy[0]!
    if (fuzzy.length > 1) {
        throw new CliError('AMBIGUOUS_ASSIGNEE', `Multiple workspace users match "${ref}".`, [
            `Matches: ${fuzzy
                .slice(0, 5)
                .map((u) => `${u.fullName} <${u.userEmail}>`)
                .join(', ')}`,
            'Use an email address or id:xxx to disambiguate.',
        ])
    }

    throw new CliError('NOT_FOUND', `No workspace user found matching "${ref}".`, [
        'Use `td workspace users <workspace>` to list members.',
    ])
}

async function findUser(
    workspaceId: string,
    predicate: (user: WorkspaceUser) => boolean,
): Promise<WorkspaceUser | null> {
    const api = await getApi()
    let cursor: string | undefined
    while (true) {
        const response = await api.getWorkspaceUsers({
            workspaceId,
            cursor,
            limit: 200,
        })
        for (const user of response.workspaceUsers) {
            if (predicate(user)) return user
        }
        if (!response.hasMore || !response.nextCursor) return null
        cursor = response.nextCursor
    }
}
