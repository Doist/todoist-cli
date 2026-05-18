import { isWorkspaceProject, type PersonalProject } from '@doist/todoist-sdk'
import { getApi } from '../../lib/api/core.js'
import { reorderProjects } from '../../lib/api/projects-sync.js'
import { CliError } from '../../lib/errors.js'
import { isQuiet } from '../../lib/global-args.js'
import { formatJson } from '../../lib/output.js'
import { resolveProjectRef } from '../../lib/refs.js'
import { validateReorderPlacement } from '../../lib/reorder.js'
import { loadPersonalProjects, resolvePersonalFromList } from './helpers.js'

export type ReorderOptions = {
    before?: string
    after?: string
    position?: number
    json?: boolean
    dryRun?: boolean
}

export async function reorderProject(ref: string, options: ReorderOptions): Promise<void> {
    validateReorderPlacement(options)

    const api = await getApi()
    const target = await resolveProjectRef(api, ref)

    if (isWorkspaceProject(target)) {
        throw new CliError(
            'WORKSPACE_REORDER_UNSUPPORTED',
            'Reorder is only supported for personal projects.',
        )
    }

    const allPersonal = await loadPersonalProjects(api)
    const targetParentId = target.parentId ?? null
    const siblings: PersonalProject[] = allPersonal
        .filter((p) => (p.parentId ?? null) === targetParentId)
        .sort((a, b) => a.childOrder - b.childOrder)

    const oldIndex = siblings.findIndex((p) => p.id === target.id)
    if (oldIndex === -1) {
        throw new CliError('NOT_FOUND', 'Target project not found among siblings.')
    }

    let newIndex: number
    if (options.position !== undefined) {
        newIndex = Math.min(options.position, siblings.length - 1)
    } else {
        const siblingRef = (options.before ?? options.after) as string
        const sibling = resolvePersonalFromList(allPersonal, siblingRef)
        if (sibling.id === target.id) {
            throw new CliError('INVALID_OPTIONS', 'Cannot reorder a project relative to itself.')
        }
        if ((sibling.parentId ?? null) !== targetParentId) {
            throw new CliError(
                'NOT_SIBLINGS',
                `Project "${sibling.name}" is not a sibling of "${target.name}".`,
            )
        }
        const siblingIdx = siblings.findIndex((p) => p.id === sibling.id)
        const adjusted = siblingIdx > oldIndex ? siblingIdx - 1 : siblingIdx
        newIndex = options.before !== undefined ? adjusted : adjusted + 1
    }

    if (newIndex === oldIndex) {
        if (options.json) {
            console.log(
                formatJson(siblings.map((p, i) => ({ id: p.id, name: p.name, position: i }))),
            )
            return
        }
        if (!isQuiet()) {
            console.log(`No change: "${target.name}" already at position ${oldIndex}.`)
        }
        return
    }

    const newOrder = [...siblings]
    const [removed] = newOrder.splice(oldIndex, 1)
    newOrder.splice(newIndex, 0, removed)

    const items = newOrder.map((p, i) => ({ id: p.id, childOrder: i + 1 }))

    if (options.dryRun) {
        console.log(`Would reorder "${target.name}": position ${oldIndex} → ${newIndex}`)
        console.log('New sibling order:')
        for (let i = 0; i < newOrder.length; i++) {
            const marker = newOrder[i].id === target.id ? '→' : ' '
            console.log(`  ${marker} ${i}: ${newOrder[i].name} (id:${newOrder[i].id})`)
        }
        return
    }

    await reorderProjects(items)

    if (options.json) {
        console.log(formatJson(newOrder.map((p, i) => ({ id: p.id, name: p.name, position: i }))))
        return
    }

    if (!isQuiet()) {
        console.log(
            `Reordered "${target.name}" (id:${target.id}): position ${oldIndex} → ${newIndex} of ${siblings.length - 1}.`,
        )
    }
}
