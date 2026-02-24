import { TodoistApi, TodoistRequestError } from '@doist/todoist-api-typescript'
import type { Project, Task } from './api/core.js'
import {
    fetchWorkspaceFolders,
    fetchWorkspaces,
    type Workspace,
    type WorkspaceFolder,
} from './api/workspaces.js'
import { formatError } from './output.js'
import { paginate } from './pagination.js'
import { ensureFresh } from './sync/engine.js'

const URL_ENTITY_TYPES = ['task', 'project', 'label', 'filter'] as const
export type UrlEntityType = (typeof URL_ENTITY_TYPES)[number]

export interface ParsedTodoistUrl {
    entityType: UrlEntityType
    id: string
}

const TODOIST_URL_PATTERN = new RegExp(
    `^https?://app\\.todoist\\.com/app/(${URL_ENTITY_TYPES.join('|')})/([^?#]+)`,
)

export function parseTodoistUrl(url: string): ParsedTodoistUrl | null {
    const match = url.match(TODOIST_URL_PATTERN)
    if (!match) return null

    const entityType = match[1] as UrlEntityType
    const slugAndId = match[2]
    const lastHyphenIndex = slugAndId.lastIndexOf('-')
    const id = lastHyphenIndex === -1 ? slugAndId : slugAndId.slice(lastHyphenIndex + 1)

    return { entityType, id }
}

const VIEW_TYPES = ['today', 'upcoming'] as const
type ViewType = (typeof VIEW_TYPES)[number]

export type TodoistRoute =
    | { kind: 'entity'; entityType: UrlEntityType; id: string }
    | { kind: 'view'; view: ViewType }

const VIEW_URL_PATTERN = new RegExp(
    `^https?://app\\.todoist\\.com/app/(${VIEW_TYPES.join('|')})(?:[?#]|$)`,
)

export function classifyTodoistUrl(url: string): TodoistRoute | null {
    const parsed = parseTodoistUrl(url)
    if (parsed) return { kind: 'entity', entityType: parsed.entityType, id: parsed.id }

    const viewMatch = url.match(VIEW_URL_PATTERN)
    if (viewMatch) return { kind: 'view', view: viewMatch[1] as ViewType }

    return null
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

function isMatchingUrlType(
    parsedUrl: ParsedTodoistUrl | null,
    expectedType: string,
): parsedUrl is ParsedTodoistUrl {
    if (!parsedUrl) return false
    if (parsedUrl.entityType !== expectedType) {
        throw new Error(
            formatError(
                'ENTITY_TYPE_MISMATCH',
                `Expected a ${expectedType} URL, but got a ${parsedUrl.entityType} URL.`,
            ),
        )
    }
    return true
}

/**
 * Synchronous ID extraction — validates ref format and returns an ID string
 * without making any API calls. Use for entities where name matching isn't
 * feasible (e.g., comments, reminders) or when only the ID is needed.
 *
 * Returns a `string` ID, not the entity object (contrast with `resolveRef`
 * which returns the full entity `T`).
 *
 * Resolution order:
 *  1. `id:` prefix → extract and return the ID
 *  2. Todoist URL → validate entity type matches, return parsed ID
 *  3. `looksLikeRawId()` → return ref as-is
 *  4. Throw `INVALID_REF` with contextual hints
 *
 * Error hints include "paste a Todoist URL" only for entity types that have
 * web URLs (task, project, label, filter). Other entities (comment, section,
 * reminder) omit the URL hint.
 */
export function lenientIdRef(ref: string, entityName: string): string {
    if (isIdRef(ref)) return extractId(ref)
    const parsedUrl = parseTodoistUrl(ref)
    if (isMatchingUrlType(parsedUrl, entityName)) return parsedUrl.id
    if (looksLikeRawId(ref)) return ref
    const hints = [`Use id:xxx format (e.g., id:${ref})`]
    if (URL_ENTITY_TYPES.includes(entityName as UrlEntityType)) {
        hints.push(`Or paste a Todoist URL (e.g., https://app.todoist.com/app/${entityName}/...)`)
    }
    throw new Error(formatError('INVALID_REF', `Invalid ${entityName} reference "${ref}".`, hints))
}

function fuzzyMatchInList<T extends { id: string }>(
    ref: string,
    items: T[],
    getName: (item: T) => string,
    entityType: string,
    context?: string,
): T | null {
    const lower = ref.toLowerCase()
    const exact = items.find((item) => getName(item).toLowerCase() === lower)
    if (exact) return exact

    const partial = items.filter((item) => getName(item).toLowerCase().includes(lower))
    if (partial.length === 1) return partial[0]
    if (partial.length > 1) {
        const suffix = context ? ` ${context}` : ''
        throw new Error(
            formatError(
                `AMBIGUOUS_${entityType.toUpperCase()}`,
                `Multiple ${entityType}s match "${ref}"${suffix}:`,
                partial.slice(0, 5).map((item) => `"${getName(item)}" (id:${item.id})`),
            ),
        )
    }

    return null
}

function resolveFromList<T extends { id: string }>(
    ref: string,
    items: T[],
    getName: (item: T) => string,
    entityType: string,
    context?: string,
): T {
    const label = entityType.charAt(0).toUpperCase() + entityType.slice(1)
    const suffix = context ? ` ${context}` : ''

    if (isIdRef(ref)) {
        const id = extractId(ref)
        const match = items.find((item) => item.id === id)
        if (match) return match
        throw new Error(
            formatError(
                `${entityType.toUpperCase()}_NOT_FOUND`,
                `${label} id:${id} not found${suffix}.`,
            ),
        )
    }

    const match = fuzzyMatchInList(ref, items, getName, entityType)
    if (match) return match

    if (looksLikeRawId(ref)) {
        const byId = items.find((item) => item.id === ref)
        if (byId) return byId
    }

    throw new Error(
        formatError(
            `${entityType.toUpperCase()}_NOT_FOUND`,
            `${label} "${ref}" not found${suffix}.`,
        ),
    )
}

/**
 * Generic resolver for entities that have names. **Private** — do not export.
 * Create entity-specific wrappers (e.g., `resolveTaskRef`, `resolveProjectRef`).
 *
 * @param ref       - User-supplied reference (name, URL, `id:xxx`, or raw ID)
 * @param fetchById - Fetches a single entity by ID
 * @param fetchAll  - Returns candidates for name matching as `{ results: T[] }`.
 *                    Does not have to fetch all items — can be a filtered search
 *                    (e.g., `resolveTaskRef` passes a server-side search query).
 * @param getName   - Extracts the display name from an entity (for matching)
 * @param entityType - Lowercase entity name, used in error codes and messages
 *
 * Resolution order:
 *  1. Empty/blank ref → throw `INVALID_{ENTITY}`
 *  2. Todoist URL → validate type matches, `fetchById` (throws `ENTITY_TYPE_MISMATCH` on mismatch)
 *  3. `id:` prefix → `extractId` → `fetchById`
 *  4. `fetchAll()` → case-insensitive exact match (`===` after `.toLowerCase()`)
 *  5. `fetchAll()` results → case-insensitive substring match (`.includes()`)
 *  6. `looksLikeRawId(ref)` → `fetchById` (swallows 404, re-throws other errors)
 *  7. Throw `{ENTITY}_NOT_FOUND`
 *
 * Ambiguity at step 4 or 5 throws `AMBIGUOUS_{ENTITY}` immediately (no
 * fallthrough) and lists up to 5 candidates with their `id:` values.
 */
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
    if (isMatchingUrlType(parsedUrl, entityType)) return fetchById(parsedUrl.id)

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
    const repo = await ensureFresh(['items'])
    if (repo) {
        return resolveRef(
            ref,
            async (id) => {
                const task = await repo.getTask(id)
                if (task) return task
                return api.getTask(id)
            },
            async () => ({ results: await repo.listTasks() }),
            (t) => t.content,
            'task',
        )
    }

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
    const repo = await ensureFresh(['projects'])
    if (repo) {
        return resolveRef(
            ref,
            async (id) => {
                const project = await repo.getProject(id)
                if (project) return project
                return api.getProject(id)
            },
            async () => ({ results: await repo.listProjects() }),
            (p) => p.name,
            'project',
        )
    }

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
    const repo = await ensureFresh(['sections'])
    if (repo) {
        const sections = await repo.listSections(projectId)
        const section = resolveFromList(ref, sections, (s) => s.name, 'section', 'in project')
        return section.id
    }

    const { results: sections } = await api.getSections({ projectId })
    const section = resolveFromList(ref, sections, (s) => s.name, 'section', 'in project')
    return section.id
}

export async function resolveParentTaskId(
    api: TodoistApi,
    ref: string,
    projectId: string,
    sectionId?: string,
): Promise<string> {
    const parsedUrl = parseTodoistUrl(ref)
    if (isMatchingUrlType(parsedUrl, 'task')) return parsedUrl.id

    if (isIdRef(ref)) {
        return extractId(ref)
    }

    const repo = await ensureFresh(['items'])
    if (repo) {
        const allTasks = await repo.listTasks()
        if (sectionId) {
            const sectionTasks = allTasks.filter((task) => task.sectionId === sectionId)
            const sectionMatch = fuzzyMatchInList(
                ref,
                sectionTasks,
                (t) => t.content,
                'task',
                'in section',
            )
            if (sectionMatch) return sectionMatch.id
        }

        const projectTasks = allTasks.filter((task) => task.projectId === projectId)
        const projectMatch = fuzzyMatchInList(
            ref,
            projectTasks,
            (t) => t.content,
            'task',
            'in project',
        )
        if (projectMatch) return projectMatch.id
    } else {
        if (sectionId) {
            const { results: sectionTasks } = await api.getTasks({ sectionId })
            const match = fuzzyMatchInList(
                ref,
                sectionTasks,
                (t) => t.content,
                'task',
                'in section',
            )
            if (match) return match.id
        }

        const { results: projectTasks } = await api.getTasks({ projectId })
        const match = fuzzyMatchInList(ref, projectTasks, (t) => t.content, 'task', 'in project')
        if (match) return match.id
    }

    if (looksLikeRawId(ref)) return ref

    throw new Error(formatError('PARENT_NOT_FOUND', `Parent task "${ref}" not found in project.`))
}

export async function resolveWorkspaceRef(ref: string): Promise<Workspace> {
    const workspaces = await fetchWorkspaces()
    return resolveFromList(ref, workspaces, (w) => w.name, 'workspace')
}

export async function resolveFolderRef(ref: string, workspaceId: string): Promise<WorkspaceFolder> {
    const allFolders = await fetchWorkspaceFolders()
    const folders = allFolders.filter((f) => f.workspaceId === workspaceId)
    return resolveFromList(ref, folders, (f) => f.name, 'folder', 'in workspace')
}
