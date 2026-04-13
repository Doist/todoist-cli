import type { Task } from '@doist/todoist-sdk'
import { getApi } from '../../lib/api/core.js'
import { prerenderMarkdown } from '../../lib/markdown.js'
import type { ViewOptions } from '../../lib/options.js'
import { formatJson, formatTaskView } from '../../lib/output.js'
import { resolveTaskRef } from '../../lib/refs.js'

export async function viewTask(ref: string, options: ViewOptions): Promise<void> {
    const api = await getApi()
    const task = await resolveTaskRef(api, ref)

    if (options.json) {
        console.log(formatJson(task, 'task', options.full, true))
        return
    }

    const { results: projects } = await api.getProjects()
    const project = projects.find((p) => p.id === task.projectId)

    let parentTask: Task | undefined
    if (task.parentId) {
        parentTask = await api.getTask(task.parentId)
    }

    const { results: subtasks } = await api.getTasks({ parentId: task.id })
    const subtaskCount = subtasks.length

    if (!options.raw) {
        await prerenderMarkdown([task.content, task.description])
    }

    console.log(
        formatTaskView({
            task,
            project,
            parentTask,
            subtaskCount,
            full: options.full,
            raw: options.raw,
        }),
    )
}
