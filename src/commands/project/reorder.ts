import { isWorkspaceProject } from '@doist/todoist-sdk'
import { getApi, type Project } from '../../lib/api/core.js'
import { reorderProjects } from '../../lib/api/projects-sync.js'
import { CliError } from '../../lib/errors.js'
import { isQuiet } from '../../lib/global-args.js'
import { formatJson } from '../../lib/output.js'
import { paginate } from '../../lib/pagination.js'
import { resolveProjectRef } from '../../lib/refs.js'

export type ReorderOptions = {
    before?: string
    after?: string
    position?: string
    json?: boolean
    dryRun?: boolean
}

export async function reorderProject(ref: string, options: ReorderOptions): Promise<void> {
    const flagCount = [options.before, options.after, options.position].filter(
        (v) => v !== undefined,
    ).length
    if (flagCount === 0) {
        throw new CliError(
            'INVALID_OPTIONS',
            'Specify exactly one of --before <ref>, --after <ref>, or --position <n>.',
        )
    }
    if (flagCount > 1) {
        throw new CliError(
            'INVALID_OPTIONS',
            '--before, --after, and --position are mutually exclusive.',
        )
    }

    const api = await getApi()
    const target = await resolveProjectRef(api, ref)

    if (isWorkspaceProject(target)) {
        throw new CliError(
            'WORKSPACE_REORDER_UNSUPPORTED',
            'Reorder is only supported for personal projects.',
        )
    }

    const { results: allProjects } = await paginate(
        (cursor, limit) => api.getProjects({ cursor: cursor ?? undefined, limit }),
        { limit: Number.MAX_SAFE_INTEGER, startCursor: undefined },
    )

    const targetParentId = (target as { parentId?: string | null }).parentId ?? null
    const siblings: Project[] = allProjects
        .filter((p) => !isWorkspaceProject(p))
        .filter((p) => ((p as { parentId?: string | null }).parentId ?? null) === targetParentId)
        .sort((a, b) => {
            const ao = (a as { childOrder?: number }).childOrder ?? 0
            const bo = (b as { childOrder?: number }).childOrder ?? 0
            return ao - bo
        })

    const oldIndex = siblings.findIndex((p) => p.id === target.id)
    if (oldIndex === -1) {
        throw new CliError('NOT_FOUND', 'Target project not found among siblings.')
    }

    let newIndex: number
    if (options.position !== undefined) {
        const parsed = Number.parseInt(options.position, 10)
        if (Number.isNaN(parsed) || parsed < 0) {
            throw new CliError('INVALID_OPTIONS', '--position must be a non-negative integer.')
        }
        newIndex = Math.min(parsed, siblings.length - 1)
    } else {
        const siblingRef = (options.before ?? options.after) as string
        const sibling = await resolveProjectRef(api, siblingRef)
        if (sibling.id === target.id) {
            throw new CliError('INVALID_OPTIONS', 'Cannot reorder a project relative to itself.')
        }
        const siblingParentId = (sibling as { parentId?: string | null }).parentId ?? null
        if (isWorkspaceProject(sibling) || siblingParentId !== targetParentId) {
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
        if (!isQuiet() && !options.json) {
            console.log(`No change: "${target.name}" already at position ${oldIndex}.`)
        }
        if (options.json) {
            console.log(
                formatJson(siblings.map((p, i) => ({ id: p.id, name: p.name, position: i }))),
            )
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
