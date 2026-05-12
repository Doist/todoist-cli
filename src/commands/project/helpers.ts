import {
    isWorkspaceProject,
    type PersonalProject,
    type ProjectViewStyle,
    type TodoistApi,
} from '@doist/todoist-sdk'
import type { Project } from '../../lib/api/core.js'
import { CliError } from '../../lib/errors.js'
import { paginate } from '../../lib/pagination.js'
import { resolveProjectRef } from '../../lib/refs.js'

export const VIEW_STYLE_CHOICES: ProjectViewStyle[] = ['list', 'board', 'calendar']

/**
 * Resolve a project reference for use as a parent. Rejects workspace projects
 * — only personal projects can have sub-projects.
 */
export async function resolvePersonalParent(
    api: TodoistApi,
    parentRef: string,
): Promise<PersonalProject> {
    const parentProject = await resolveProjectRef(api, parentRef)
    if (isWorkspaceProject(parentProject)) {
        throw new CliError(
            'WORKSPACE_NO_SUBPROJECTS',
            'Workspace projects cannot be used as a parent.',
            ['Sub-projects are only supported under personal projects.'],
        )
    }
    return parentProject
}

/**
 * Load every personal project the user has access to (paginated). Used by
 * commands that need to traverse the project hierarchy in memory rather than
 * making N round trips.
 */
export async function loadPersonalProjects(api: TodoistApi): Promise<PersonalProject[]> {
    const { results } = await paginate(
        (cursor, limit) => api.getProjects({ cursor: cursor ?? undefined, limit }),
        { limit: Number.MAX_SAFE_INTEGER, startCursor: undefined },
    )
    return results.filter((p): p is PersonalProject => !isWorkspaceProject(p))
}

/**
 * Returns true if `candidateId` is a descendant of `ancestorId` within the
 * given project set. Walks the parent chain in memory; bails on cycles.
 */
export function isDescendantOf(
    projects: PersonalProject[],
    candidateId: string,
    ancestorId: string,
): boolean {
    const byId = new Map(projects.map((p) => [p.id, p]))
    let current = byId.get(candidateId)
    const visited = new Set<string>()
    while (current?.parentId && !visited.has(current.id)) {
        visited.add(current.id)
        if (current.parentId === ancestorId) return true
        current = byId.get(current.parentId)
    }
    return false
}

export function isPersonal(p: Project): p is PersonalProject {
    return !isWorkspaceProject(p)
}

/**
 * Resolve a project reference against an in-memory personal-project list,
 * avoiding extra round trips when the caller has already paginated the
 * full list (e.g. `project reorder`). Mirrors the matching rules of
 * `resolveProjectRef` (id prefix → exact name → substring name) but is
 * scoped to personal projects only.
 */
export function resolvePersonalFromList(projects: PersonalProject[], ref: string): PersonalProject {
    if (!ref.trim()) {
        throw new CliError('INVALID_PROJECT', 'project reference cannot be empty.')
    }
    if (ref.startsWith('id:')) {
        const id = ref.slice(3)
        const match = projects.find((p) => p.id === id)
        if (!match) {
            throw new CliError('PROJECT_NOT_FOUND', `Personal project "${ref}" not found.`)
        }
        return match
    }
    const lower = ref.toLowerCase()
    const exact = projects.filter((p) => p.name.toLowerCase() === lower)
    if (exact.length === 1) return exact[0]
    if (exact.length > 1) {
        throw new CliError(
            'AMBIGUOUS_PROJECT',
            `Multiple projects match "${ref}" exactly:`,
            exact.slice(0, 5).map((p) => `"${p.name}" (id:${p.id})`),
        )
    }
    const partial = projects.filter((p) => p.name.toLowerCase().includes(lower))
    if (partial.length === 1) return partial[0]
    if (partial.length > 1) {
        throw new CliError(
            'AMBIGUOUS_PROJECT',
            `Multiple projects match "${ref}":`,
            partial.slice(0, 5).map((p) => `"${p.name}" (id:${p.id})`),
        )
    }
    throw new CliError('PROJECT_NOT_FOUND', `Personal project "${ref}" not found.`)
}
