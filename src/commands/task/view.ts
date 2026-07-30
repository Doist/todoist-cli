import { getApi } from '../../lib/api/core.js'
import { getTaskChildren, resolveChildren } from '../../lib/children.js'
import type { ViewOptions } from '../../lib/options.js'
import {
    formatJson,
    formatTaskView,
    processChildrenJson,
    processJsonItem,
} from '../../lib/output.js'
import { resolveTaskRef } from '../../lib/refs.js'

export async function viewTask(
    ref: string,
    options: ViewOptions & { includeChildren?: boolean },
): Promise<void> {
    const api = await getApi()
    const task = await resolveTaskRef(api, ref)

    // Started rather than awaited: the lookup keys off the task id alone, so it
    // runs alongside the project and parent fetches below.
    const childrenRequest = options.includeChildren
        ? resolveChildren(() => getTaskChildren(api, task.id))
        : undefined

    if (options.json) {
        const children = await childrenRequest
        if (!children) {
            console.log(formatJson(task, 'task', options.full, true))
            return
        }
        console.log(
            formatJson({
                ...processJsonItem(task, 'task', options.full ?? false, true),
                ...processChildrenJson(children, 'task', options.full, true),
            }),
        )
        return
    }

    const [{ results: projects }, parentTask, children] = await Promise.all([
        api.getProjects(),
        task.parentId ? api.getTask(task.parentId) : undefined,
        childrenRequest,
    ])
    const project = projects.find((p) => p.id === task.projectId)

    // The listing already counted them; don't fetch the same subtasks twice.
    const subtaskCount = children
        ? undefined
        : (await api.getTasks({ parentId: task.id })).results.length

    console.log(
        await formatTaskView({
            task,
            project,
            parentTask,
            subtaskCount,
            children,
            full: options.full,
            raw: options.raw,
        }),
    )
}
