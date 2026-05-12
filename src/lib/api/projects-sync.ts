import { createCommand } from '@doist/todoist-sdk'
import { getApi } from './core.js'

export async function moveProjectParent(id: string, parentId: string | null): Promise<void> {
    const api = await getApi()
    await api.sync({
        commands: [createCommand('project_move', { id, parentId })],
    })
}

export async function reorderProjects(
    items: Array<{ id: string; childOrder: number }>,
): Promise<void> {
    const api = await getApi()
    await api.sync({
        commands: [createCommand('project_reorder', { projects: items })],
    })
}
