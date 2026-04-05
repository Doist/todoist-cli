import { getApi } from '../../lib/api/core.js'
import { formatError, isQuiet, printDryRun } from '../../lib/output.js'
import {
    resolveParentTaskId,
    resolveProjectId,
    resolveSectionId,
    resolveTaskRef,
} from '../../lib/refs.js'

export interface MoveOptions {
    project?: string
    section?: string | false
    parent?: string | false
    dryRun?: boolean
}

export async function moveTask(ref: string, options: MoveOptions): Promise<void> {
    const wantsNoParent = options.parent === false
    const wantsNoSection = options.section === false
    const hasDestination =
        options.project || options.section || options.parent || wantsNoParent || wantsNoSection
    if (!hasDestination) {
        throw new Error(
            formatError(
                'MISSING_DESTINATION',
                'At least one of --project, --section, --parent, --no-parent, or --no-section is required.',
            ),
        )
    }

    const api = await getApi()
    const task = await resolveTaskRef(api, ref)

    if (options.dryRun) {
        printDryRun('move task', {
            Task: task.content,
            Project: typeof options.project === 'string' ? options.project : undefined,
            Section: typeof options.section === 'string' ? options.section : undefined,
            'No section': options.section === false ? 'yes' : undefined,
            Parent: typeof options.parent === 'string' ? options.parent : undefined,
            'No parent': options.parent === false ? 'yes' : undefined,
        })
        return
    }

    if (wantsNoParent || wantsNoSection) {
        const targetProjectId = options.project
            ? await resolveProjectId(api, options.project)
            : task.projectId
        await api.moveTask(task.id, { projectId: targetProjectId })
        if (!isQuiet()) console.log(`Moved: ${task.content} (id:${task.id})`)
        return
    }

    const targetProjectId = options.project
        ? await resolveProjectId(api, options.project)
        : task.projectId

    let targetSectionId: string | undefined
    if (options.section) {
        targetSectionId = await resolveSectionId(api, options.section, targetProjectId)
    }

    if (options.parent) {
        const parentId = await resolveParentTaskId(
            api,
            options.parent,
            targetProjectId,
            targetSectionId ?? task.sectionId ?? undefined,
        )
        await api.moveTask(task.id, { parentId })
    } else if (targetSectionId) {
        await api.moveTask(task.id, { sectionId: targetSectionId })
    } else {
        await api.moveTask(task.id, { projectId: targetProjectId })
    }
    console.log(`Moved: ${task.content}`)
}
