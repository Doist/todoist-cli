import { TodoistApi, TodoistRequestError } from '@doist/todoist-api-typescript'
import type { Project, Task } from './api/core.js'
import { fetchWorkspaces, type Workspace } from './api/workspaces.js'
import { formatError } from './output.js'
import { paginate } from './pagination.js'

type UrlEntityType = 'task' | 'project'

export interface ParsedTodoistUrl {
    entityType: UrlEntityType
    id: string
}

const TODOIST_URL_PATTERN = /^https?:\/\/app\.todoist\.com\/app\/(task|project)\/([^?#]+)/

export function parseTodoistUrl(url: string): ParsedTodoistUrl | null {
    const match = url.match(TODOIST_URL_PATTERN)
    if (!match) return null

    const entityType = match[1] as UrlEntityType
    const slugAndId = match[2]
    const lastHyphenIndex = slugAndId.lastIndexOf('-')
    const id = lastHyphenIndex === -1 ? slugAndId : slugAndId.slice(lastHyphenIndex + 1)

    return { entityType, id }
}

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

export function lenientIdRef(ref: string, entityName: string): string {
    if (isIdRef(ref)) return extractId(ref)
    const parsedUrl = parseTodoistUrl(ref)
    if (parsedUrl) return parsedUrl.id
    if (looksLikeRawId(ref)) return ref
    throw new Error(
        formatError('INVALID_REF', `Invalid ${entityName} reference "${ref}".`, [
            `Use id:xxx format (e.g., id:${ref})`,
            `Or paste a Todoist URL (e.g., https://app.todoist.com/app/${entityName}/...)`,
        ]),
    )
}

async function resolveRef<T extends { id: string }>(
    ref: string,
    fetchById: (id: string) => Promise<T>,
    fetchAll: () => Promise<{ results: T[] }>,
    getName: (item: T) => string,
    entityType: string,
): Promise<T> {
    if (!ref.trim()) {
        throw new Error(
            formatError(
                `INVALID_${entityType.toUpperCase()}`,
                `${entityType} reference cannot be empty.`,
            ),
        )
    }

    const parsedUrl = parseTodoistUrl(ref)
    if (parsedUrl) return fetchById(parsedUrl.id)

    if (isIdRef(ref)) {
        return fetchById(extractId(ref))
    }

    const { results } = await fetchAll()
    const lower = ref.toLowerCase()

    const exact = results.filter((item) => getName(item).toLowerCase() === lower)
    if (exact.length === 1) return exact[0]
    if (exact.length > 1) {
        throw new Error(
            formatError(
                `AMBIGUOUS_${entityType.toUpperCase()}`,
                `Multiple ${entityType}s match "${ref}" exactly:`,
                exact.slice(0, 5).map((item) => `"${getName(item)}" (id:${item.id})`),
            ),
        )
    }

    const partial = results.filter((item) => getName(item).toLowerCase().includes(lower))
    if (partial.length === 1) return partial[0]
    if (partial.length > 1) {
        throw new Error(
            formatError(
                `AMBIGUOUS_${entityType.toUpperCase()}`,
                `Multiple ${entityType}s match "${ref}":`,
                partial.slice(0, 5).map((item) => `"${getName(item)}" (id:${item.id})`),
            ),
        )
    }

    if (looksLikeRawId(ref)) {
        try {
            return await fetchById(ref)
        } catch (error) {
            if (error instanceof TodoistRequestError && error.httpStatusCode === 404) {
                // Genuine not-found — fall through to generic error
            } else {
                throw error
            }
        }
    }

    throw new Error(
        formatError(`${entityType.toUpperCase()}_NOT_FOUND`, `${entityType} "${ref}" not found.`),
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
                { limit: 5 },
            ),
        (t) => t.content,
        'task',
    )
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

    if (looksLikeRawId(ref)) {
        const byId = sections.find((s) => s.id === ref)
        if (byId) return byId.id
    }

    throw new Error(formatError('SECTION_NOT_FOUND', `Section "${ref}" not found in project.`))
}

export async function resolveParentTaskId(
    api: TodoistApi,
    ref: string,
    projectId: string,
    sectionId?: string,
): Promise<string> {
    const parsedUrl = parseTodoistUrl(ref)
    if (parsedUrl) return parsedUrl.id

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

    if (looksLikeRawId(ref)) return ref

    throw new Error(formatError('PARENT_NOT_FOUND', `Parent task "${ref}" not found in project.`))
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

    if (looksLikeRawId(ref)) {
        const byId = workspaces.find((w) => w.id === ref)
        if (byId) return byId
    }

    throw new Error(formatError('WORKSPACE_NOT_FOUND', `Workspace "${ref}" not found.`))
}
