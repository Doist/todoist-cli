import type { Task } from '@doist/todoist-sdk'
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

    const children = options.includeChildren
        ? await resolveChildren(() => getTaskChildren(api, task.id))
        : undefined

    if (options.json) {
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

    const { results: projects } = await api.getProjects()
    const project = projects.find((p) => p.id === task.projectId)

    let parentTask: Task | undefined
    if (task.parentId) {
        parentTask = await api.getTask(task.parentId)
    }

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
