import { isWorkspaceProject, type TodoistApi } from '@doist/todoist-sdk'
import { getCurrentUserId, type Project, type Task } from './api/core.js'
import { CliError } from './errors.js'
import { extractId, isIdRef } from './refs.js'

export interface CollaboratorInfo {
    id: string
    name: string
    email: string
}

export class CollaboratorCache {
    private workspaceUsers = new Map<string, Map<string, CollaboratorInfo>>()
    private projectCollaborators = new Map<string, Map<string, CollaboratorInfo>>()

    async preload(api: TodoistApi, tasks: Task[], projects: Map<string, Project>): Promise<void> {
        const projectsWithAssignees = new Set<string>()
        for (const task of tasks) {
            if (task.responsibleUid) {
                projectsWithAssignees.add(task.projectId)
            }
        }

        if (projectsWithAssignees.size === 0) return

        const workspaceIds = new Set<string>()
        const sharedPersonalProjectIds: string[] = []

        for (const projectId of projectsWithAssignees) {
            const project = projects.get(projectId)
            if (!project) continue

            if (isWorkspaceProject(project)) {
                workspaceIds.add(project.workspaceId)
            } else if (project.isShared) {
                sharedPersonalProjectIds.push(projectId)
            }
        }

        const fetches: Promise<void>[] = []

        for (const workspaceId of workspaceIds) {
            if (!this.workspaceUsers.has(workspaceId)) {
                fetches.push(this.fetchWorkspaceUsers(api, workspaceId))
            }
        }

        for (const projectId of sharedPersonalProjectIds) {
            if (!this.projectCollaborators.has(projectId)) {
                fetches.push(this.fetchProjectCollaborators(api, projectId))
            }
        }

        await Promise.all(fetches)
    }

    private async fetchWorkspaceUsers(api: TodoistApi, workspaceId: string): Promise<void> {
        const userMap = new Map<string, CollaboratorInfo>()
        let cursor: string | undefined

        while (true) {
            const response = await api.getWorkspaceUsers({
                workspaceId,
                cursor,
                limit: 200,
            })

            for (const user of response.workspaceUsers) {
                userMap.set(user.userId, {
                    id: user.userId,
                    name: user.fullName,
                    email: user.userEmail,
                })
            }

            if (!response.hasMore || !response.nextCursor) break
            cursor = response.nextCursor
        }

        this.workspaceUsers.set(workspaceId, userMap)
    }

    private async fetchProjectCollaborators(api: TodoistApi, projectId: string): Promise<void> {
        const userMap = new Map<string, CollaboratorInfo>()
        let cursor: string | undefined

        while (true) {
            const response = await api.getProjectCollaborators(projectId, { cursor })

            for (const user of response.results) {
                userMap.set(user.id, {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                })
            }

            if (!response.nextCursor) break
            cursor = response.nextCursor
        }

        this.projectCollaborators.set(projectId, userMap)
    }

    getUserName({
        userId,
        projectId,
        projects,
    }: {
        userId: string
        projectId: string
        projects: Map<string, Project>
    }): string | null {
        const project = projects.get(projectId)
        if (!project) return null

        if (isWorkspaceProject(project)) {
            const workspaceMap = this.workspaceUsers.get(project.workspaceId)
            const user = workspaceMap?.get(userId)
            return user?.name ?? null
        }

        const projectMap = this.projectCollaborators.get(projectId)
        const user = projectMap?.get(userId)
        return user?.name ?? null
    }
}

export function formatUserShortName(fullName: string): string {
    const parts = fullName.trim().split(/\s+/)
    if (parts.length === 1) {
        return parts[0]
    }
    const firstName = parts[0]
    const lastInitial = parts[parts.length - 1][0]
    return `${firstName} ${lastInitial}.`
}

export interface FormatAssigneeOptions {
    userId: string | null
    projectId: string
    projects: Map<string, Project>
    cache: CollaboratorCache
}

export function formatAssignee({
    userId,
    projectId,
    projects,
    cache,
}: FormatAssigneeOptions): string | null {
    if (!userId) return null

    const name = cache.getUserName({ userId, projectId, projects })
    if (name) {
        return formatUserShortName(name)
    }
    return userId
}

/**
 * Every user who can see a project: workspace members for a workspace project,
 * collaborators for a shared personal one. A project that is neither has
 * nobody but the owner, and returns an empty list — callers decide what that
 * means for them, since "nobody to assign to" and "nobody to notify" want
 * different wording.
 */
export async function fetchCollaboratorsForProject(
    api: TodoistApi,
    project: Project,
): Promise<CollaboratorInfo[]> {
    if (isWorkspaceProject(project)) {
        const users: CollaboratorInfo[] = []
        let cursor: string | undefined
        while (true) {
            const response = await api.getWorkspaceUsers({
                workspaceId: project.workspaceId,
                cursor,
                limit: 200,
            })

            for (const user of response.workspaceUsers) {
                users.push({
                    id: user.userId,
                    name: user.fullName,
                    email: user.userEmail,
                })
            }

            if (!response.hasMore || !response.nextCursor) break
            cursor = response.nextCursor
        }
        return users
    }

    if (project.isShared) {
        const users: CollaboratorInfo[] = []
        let cursor: string | undefined

        while (true) {
            const response = await api.getProjectCollaborators(project.id, {
                cursor,
            })

            for (const user of response.results) {
                users.push({
                    id: user.id,
                    name: user.name,
                    email: user.email,
                })
            }

            if (!response.nextCursor) break
            cursor = response.nextCursor
        }
        return users
    }

    return []
}

/**
 * Match one reference against a collaborator list by exact name, exact email,
 * then unique partial name. Returns null when nothing matches; an ambiguous
 * partial is an error rather than a guess.
 *
 * Shared by assignment and comment notification so the two cannot drift apart.
 * Handles neither `me` nor `id:xxx` — both resolve without a collaborator list
 * at all, so callers short-circuit them before fetching one.
 */
function matchCollaboratorRef(
    ref: string,
    collaborators: CollaboratorInfo[],
): CollaboratorInfo | null {
    const lower = ref.toLowerCase()

    const exact =
        collaborators.find((c) => c.name.toLowerCase() === lower) ??
        collaborators.find((c) => c.email.toLowerCase() === lower)
    if (exact) return exact

    const partial = collaborators.filter((c) => c.name.toLowerCase().includes(lower))
    if (partial.length > 1) {
        throw new CliError(
            'AMBIGUOUS_ASSIGNEE',
            `Multiple users match "${ref}":`,
            partial.slice(0, 5).map((c) => `"${c.name}" (id:${c.id})`),
        )
    }
    return partial[0] ?? null
}

export async function resolveAssigneeId(
    api: TodoistApi,
    ref: string,
    project: Project,
): Promise<string> {
    if (ref.toLowerCase() === 'me') {
        return getCurrentUserId()
    }

    if (isIdRef(ref)) {
        return extractId(ref)
    }

    const collaborators = await fetchCollaboratorsForProject(api, project)
    if (collaborators.length === 0) {
        throw new CliError('NOT_SHARED', 'Cannot assign tasks in non-shared projects.')
    }

    const match = matchCollaboratorRef(ref, collaborators)
    if (!match) {
        throw new CliError('ASSIGNEE_NOT_FOUND', `User "${ref}" not found.`)
    }
    return match.id
}

/**
 * Resolve a list of user references — names, emails, `id:xxx` or `me` — to the
 * user IDs to notify about a comment.
 *
 * Pure over an already-fetched collaborator list, so the caller fetches once
 * and can reuse the same list to render the names back. References are
 * deduplicated, and every one that cannot be resolved is reported together so
 * the caller fixes them all in one go rather than one per run.
 */
export function resolveNotifyIds({
    refs,
    collaborators,
    currentUserId,
    projectName,
}: {
    refs: string[]
    collaborators: CollaboratorInfo[]
    currentUserId: string
    projectName: string
}): string[] {
    const seenRefs = new Set<string>()
    const resolved: string[] = []
    const unresolved: string[] = []
    const needCollaborators: string[] = []

    for (const ref of refs) {
        const trimmed = ref.trim()
        if (!trimmed) continue
        const lower = trimmed.toLowerCase()
        if (seenRefs.has(lower)) continue
        seenRefs.add(lower)

        // Resolvable without knowing who shares the project, so these work even
        // on a personal one.
        if (lower === 'me') {
            resolved.push(currentUserId)
            continue
        }
        if (isIdRef(trimmed)) {
            resolved.push(extractId(trimmed))
            continue
        }

        if (collaborators.length === 0) {
            needCollaborators.push(trimmed)
            continue
        }

        const match = matchCollaboratorRef(trimmed, collaborators)
        if (match) {
            resolved.push(match.id)
        } else {
            unresolved.push(trimmed)
        }
    }

    if (needCollaborators.length > 0) {
        throw new CliError(
            'NOT_SHARED',
            `Cannot notify ${formatRefs(needCollaborators)} — "${projectName}" is not shared with anybody.`,
        )
    }
    if (unresolved.length > 0) {
        throw new CliError(
            'ASSIGNEE_NOT_FOUND',
            `Cannot notify ${formatRefs(unresolved)} — not a collaborator on "${projectName}".`,
            ['Use `td project collaborators` to see who can be notified'],
        )
    }

    // No self-exclusion here: naming yourself is an explicit instruction and is
    // honoured. Leaving yourself out is only right when the recipients were
    // inferred rather than asked for -- see getDefaultCommentRecipients.
    return [...new Set(resolved)]
}

function formatRefs(refs: string[]): string {
    return refs.map((ref) => `"${ref}"`).join(', ')
}
