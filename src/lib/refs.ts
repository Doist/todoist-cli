import { TodoistApi } from '@doist/todoist-api-typescript'
import type { Project, Task } from './api/core.js'
import { fetchWorkspaces, type Workspace } from './api/workspaces.js'
import { getLogger } from './logger.js'
import { formatError } from './output.js'
import { paginate } from './pagination.js'

export function isIdRef(ref: string): boolean {
    return ref.startsWith('id:')
}

export function extractId(ref: string): string {
    return ref.slice(3)
}

export function looksLikeRawId(ref: string): boolean {
    if (ref.includes(' ')) return false
    return /^\d+$/.test(ref) || (/[a-zA-Z]/.test(ref) && /\d/.test(ref))
}

function idPrefixHint(ref: string): string[] {
    if (!looksLikeRawId(ref)) return []
    return [`If "${ref}" is an ID, prefix it: id:${ref}`]
}

export function requireIdRef(ref: string, entityName: string): string {
    if (!isIdRef(ref)) {
        throw new Error(
            formatError('INVALID_REF', `Invalid ${entityName} reference "${ref}".`, [
                `Use id:xxx format (e.g., id:${ref})`,
            ]),
        )
    }
    return extractId(ref)
}

async function resolveRef<T extends { id: string }>(
    ref: string,
    fetchById: (id: string) => Promise<T>,
    fetchAll: () => Promise<{ results: T[] }>,
    getName: (item: T) => string,
    entityType: string,
): Promise<T> {
    const logger = getLogger()

    if (!ref.trim()) {
        throw new Error(
            formatError(
                `INVALID_${entityType.toUpperCase()}`,
                `${entityType} reference cannot be empty.`,
            ),
        )
    }

    if (isIdRef(ref)) {
        const id = extractId(ref)
        logger.debug(`resolve ${entityType}: direct ID lookup`, { id })
        return fetchById(id)
    }

    logger.debug(`resolve ${entityType}: name search`, { ref })
    const { results } = await fetchAll()
    logger.debug(`resolve ${entityType}: candidates fetched`, { count: results.length })
    const lower = ref.toLowerCase()

    const exact = results.filter((item) => getName(item).toLowerCase() === lower)
    if (exact.length === 1) {
        logger.debug(`resolve ${entityType}: exact match`, { id: exact[0].id, name: getName(exact[0]) })
        return exact[0]
    }
    if (exact.length > 1) {
        logger.debug(`resolve ${entityType}: ambiguous exact matches`, { count: exact.length })
        throw new Error(
            formatError(
                `AMBIGUOUS_${entityType.toUpperCase()}`,
                `Multiple ${entityType}s match "${ref}" exactly:`,
                exact.slice(0, 5).map((item) => `"${getName(item)}" (id:${item.id})`),
            ),
        )
    }

    const partial = results.filter((item) => getName(item).toLowerCase().includes(lower))
    if (partial.length === 1) {
        logger.debug(`resolve ${entityType}: partial match`, { id: partial[0].id, name: getName(partial[0]) })
        return partial[0]
    }
    if (partial.length > 1) {
        logger.debug(`resolve ${entityType}: ambiguous partial matches`, { count: partial.length })
        throw new Error(
            formatError(
                `AMBIGUOUS_${entityType.toUpperCase()}`,
                `Multiple ${entityType}s match "${ref}":`,
                partial.slice(0, 5).map((item) => `"${getName(item)}" (id:${item.id})`),
            ),
        )
    }

    logger.debug(`resolve ${entityType}: not found`, { ref })
    throw new Error(
        formatError(
            `${entityType.toUpperCase()}_NOT_FOUND`,
            `${entityType} "${ref}" not found.`,
            idPrefixHint(ref),
        ),
    )
}

export async function resolveTaskRef(api: TodoistApi, ref: string): Promise<Task> {
    return resolveRef(
        ref,
        (id) => api.getTask(id),
        () =>
            paginate(
                (cursor, limit) =>
                    api.getTasksByFilter({
                        query: `search: ${ref}`,
                        cursor: cursor ?? undefined,
                        limit,
                    }),
                { limit: 5 }, // Enough for resolveRef to detect and log a sample of ambiguous matches
            ),
        (t) => t.content,
        'task',
    ).catch((err) => {
        // If ref looks like a raw ID (numeric or alphanumeric mix), try as direct ID lookup
        if (looksLikeRawId(ref)) {
            const logger = getLogger()
            logger.debug('resolve task: name search failed, retrying as ID', { ref })
            return resolveTaskRef(api, `id:${ref}`)
        }
        throw err
    })
}

export async function resolveProjectRef(api: TodoistApi, ref: string): Promise<Project> {
    return resolveRef(
        ref,
        (id) => api.getProject(id),
        () => api.getProjects(),
        (p) => p.name,
        'project',
    )
}

export async function resolveProjectId(api: TodoistApi, ref: string): Promise<string> {
    const project = await resolveProjectRef(api, ref)
    return project.id
}

export async function resolveSectionId(
    api: TodoistApi,
    ref: string,
    projectId: string,
): Promise<string> {
    const { results: sections } = await api.getSections({ projectId })

    if (isIdRef(ref)) {
        const id = extractId(ref)
        const section = sections.find((s) => s.id === id)
        if (!section) {
            throw new Error(
                formatError(
                    'SECTION_NOT_IN_PROJECT',
                    `Section id:${id} does not belong to this project.`,
                ),
            )
        }
        return id
    }

    const lower = ref.toLowerCase()
    const exact = sections.find((s) => s.name.toLowerCase() === lower)
    if (exact) return exact.id

    const partial = sections.filter((s) => s.name.toLowerCase().includes(lower))
    if (partial.length === 1) return partial[0].id
    if (partial.length > 1) {
        throw new Error(
            formatError(
                'AMBIGUOUS_SECTION',
                `Multiple sections match "${ref}":`,
                partial.slice(0, 5).map((s) => `"${s.name}" (id:${s.id})`),
            ),
        )
    }

    throw new Error(
        formatError(
            'SECTION_NOT_FOUND',
            `Section "${ref}" not found in project.`,
            idPrefixHint(ref),
        ),
    )
}

export async function resolveParentTaskId(
    api: TodoistApi,
    ref: string,
    projectId: string,
    sectionId?: string,
): Promise<string> {
    if (isIdRef(ref)) {
        return extractId(ref)
    }

    const lower = ref.toLowerCase()

    if (sectionId) {
        const { results: sectionTasks } = await api.getTasks({ sectionId })
        const exact = sectionTasks.find((t) => t.content.toLowerCase() === lower)
        if (exact) return exact.id

        const partial = sectionTasks.filter((t) => t.content.toLowerCase().includes(lower))
        if (partial.length === 1) return partial[0].id
        if (partial.length > 1) {
            throw new Error(
                formatError(
                    'AMBIGUOUS_PARENT',
                    `Multiple tasks match "${ref}" in section:`,
                    partial.slice(0, 5).map((t) => `"${t.content}" (id:${t.id})`),
                ),
            )
        }
    }

    const { results: projectTasks } = await api.getTasks({ projectId })
    const exact = projectTasks.find((t) => t.content.toLowerCase() === lower)
    if (exact) return exact.id

    const partial = projectTasks.filter((t) => t.content.toLowerCase().includes(lower))
    if (partial.length === 1) return partial[0].id
    if (partial.length > 1) {
        throw new Error(
            formatError(
                'AMBIGUOUS_PARENT',
                `Multiple tasks match "${ref}" in project:`,
                partial.slice(0, 5).map((t) => `"${t.content}" (id:${t.id})`),
            ),
        )
    }

    throw new Error(
        formatError(
            'PARENT_NOT_FOUND',
            `Parent task "${ref}" not found in project.`,
            idPrefixHint(ref),
        ),
    )
}

export async function resolveWorkspaceRef(ref: string): Promise<Workspace> {
    const workspaces = await fetchWorkspaces()

    if (isIdRef(ref)) {
        const id = extractId(ref)
        const workspace = workspaces.find((w) => w.id === id)
        if (!workspace) {
            throw new Error(formatError('WORKSPACE_NOT_FOUND', `Workspace id:${id} not found.`))
        }
        return workspace
    }

    const lower = ref.toLowerCase()
    const exact = workspaces.find((w) => w.name.toLowerCase() === lower)
    if (exact) return exact

    const partial = workspaces.filter((w) => w.name.toLowerCase().includes(lower))
    if (partial.length === 1) return partial[0]
    if (partial.length > 1) {
        throw new Error(
            formatError(
                'AMBIGUOUS_WORKSPACE',
                `Multiple workspaces match "${ref}":`,
                partial.slice(0, 5).map((w) => `"${w.name}" (id:${w.id})`),
            ),
        )
    }

    throw new Error(
        formatError('WORKSPACE_NOT_FOUND', `Workspace "${ref}" not found.`, idPrefixHint(ref)),
    )
}
