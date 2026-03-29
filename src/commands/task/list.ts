import { getApi } from '../../lib/api/core.js'
import { resolveProjectId, resolveTaskRef } from '../../lib/refs.js'
import { listTasksForProject, type TaskListOptions } from '../../lib/task-list.js'

export type ListOptions = TaskListOptions & { project?: string }

export async function listTasks(options: ListOptions): Promise<void> {
    const api = await getApi()

    let projectId: string | null = null
    if (options.project) {
        projectId = await resolveProjectId(api, options.project)
    }

    let parentId: string | undefined
    if (options.parent) {
        const parentTask = await resolveTaskRef(api, options.parent)
        parentId = parentTask.id
        if (!projectId) projectId = parentTask.projectId
    }

    await listTasksForProject(projectId, { ...options, parent: parentId })
}
