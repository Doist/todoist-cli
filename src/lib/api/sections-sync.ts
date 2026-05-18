import { createCommand } from '@doist/todoist-sdk'
import { getApi } from './core.js'

export async function reorderSections(
    items: Array<{ id: string; sectionOrder: number }>,
): Promise<void> {
    const api = await getApi()
    await api.sync({
        commands: [createCommand('section_reorder', { sections: items })],
    })
}
