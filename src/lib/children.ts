import {
    isWorkspaceProject,
    type PersonalProject,
    type Task,
    type TodoistApi,
} from '@doist/todoist-sdk'
import type { Project } from './api/core.js'

/** Max direct children listed by `--include-children`; past this the list is truncated. */
export const CHILDREN_MAX = 25

export type TaskChild = Task & { hasChildren: boolean }
export type ProjectChild = PersonalProject & { hasChildren: boolean }

export type ChildrenResult<C extends TaskChild | ProjectChild> = {
    /** Children listed in `children`. 0 means definitively none; undefined only when the lookup failed. */
    childCount?: number
    children?: C[]
    /** True when more direct children exist than were listed. */
    hasMoreChildren?: boolean
    /** Set when the lookup failed outright, or when some nesting probes failed. */
    childrenError?: string
}

/**
 * Fetches the direct subtasks of a task, flagging which of them nest further.
 *
 * The API exposes no child count on a task, so each child needs its own probe.
 * That keeps the cost proportional to the number of subtasks rather than to the
 * size of the project, which matters because the common case is a task with none.
 */
export async function getTaskChildren(
    api: TodoistApi,
    taskId: string,
): Promise<ChildrenResult<TaskChild>> {
    const { results, nextCursor } = await api.getTasks({ parentId: taskId, limit: CHILDREN_MAX })

    // Settled rather than all: a probe that fails should cost its own nesting
    // flag, not the whole subtask listing that was already fetched.
    const probes = await Promise.allSettled(
        results.map(({ id }) => api.getTasks({ parentId: id, limit: 1 })),
    )
    const unprobed = probes.filter((probe) => probe.status === 'rejected').length

    return {
        childCount: results.length,
        children: results.map((child, index) => {
            const probe = probes[index]
            return {
                ...child,
                hasChildren: probe?.status === 'fulfilled' && probe.value.results.length > 0,
            }
        }),
        hasMoreChildren: nextCursor ? true : undefined,
        childrenError: unprobed
            ? `nesting unknown for ${unprobed} of ${results.length} subtasks`
            : undefined,
    }
}

/**
 * Groups a pre-fetched personal-project list into `project`'s direct sub-projects,
 * flagging which of them nest further.
 *
 * Pure by design: projects cannot be filtered by parent server-side, so the caller
 * pays for one full fetch ({@link loadPersonalProjects}) and this derives the
 * hierarchy in memory — which also lets the caller reuse that list to resolve the
 * parent project's name.
 */
export function buildProjectChildren(
    project: Project,
    allPersonal: PersonalProject[],
): ChildrenResult<ProjectChild> {
    // Workspace projects live in folders rather than under a parent project, so
    // they never have sub-projects.
    if (isWorkspaceProject(project)) return { childCount: 0, children: [] }

    const byParent = new Map<string, PersonalProject[]>()
    for (const candidate of allPersonal) {
        if (!candidate.parentId) continue
        const siblings = byParent.get(candidate.parentId) ?? []
        siblings.push(candidate)
        byParent.set(candidate.parentId, siblings)
    }

    const direct = [...(byParent.get(project.id) ?? [])].sort((a, b) => a.childOrder - b.childOrder)
    const listed = direct.slice(0, CHILDREN_MAX)

    return {
        childCount: listed.length,
        children: listed.map((child) => ({
            ...child,
            hasChildren: (byParent.get(child.id)?.length ?? 0) > 0,
        })),
        hasMoreChildren: direct.length > listed.length ? true : undefined,
    }
}

/**
 * Runs a children lookup without letting its failure sink the view it enriches.
 * The error is reported rather than swallowed: a missing childCount would read as
 * "no children", the exact mistake these fields exist to prevent.
 */
export async function resolveChildren<C extends TaskChild | ProjectChild>(
    load: () => Promise<ChildrenResult<C>>,
): Promise<ChildrenResult<C>> {
    try {
        return await load()
    } catch (error) {
        return { childrenError: error instanceof Error ? error.message : String(error) }
    }
}
