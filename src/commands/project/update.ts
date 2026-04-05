import type { ColorKey, ProjectViewStyle } from '@doist/todoist-sdk'
import { getApi } from '../../lib/api/core.js'
import { formatError, formatJson, isQuiet, printDryRun } from '../../lib/output.js'
import { resolveProjectRef } from '../../lib/refs.js'

export interface UpdateOptions {
    name?: string
    color?: ColorKey
    favorite?: boolean
    viewStyle?: string
    json?: boolean
    dryRun?: boolean
}

export async function updateProject(ref: string, options: UpdateOptions): Promise<void> {
    const api = await getApi()
    const project = await resolveProjectRef(api, ref)

    const args: {
        name?: string
        color?: ColorKey
        isFavorite?: boolean
        viewStyle?: ProjectViewStyle
    } = {}
    if (options.name) args.name = options.name
    if (options.color) args.color = options.color
    if (options.favorite === true) args.isFavorite = true
    if (options.favorite === false) args.isFavorite = false
    if (options.viewStyle) args.viewStyle = options.viewStyle as ProjectViewStyle

    if (Object.keys(args).length === 0) {
        throw new Error(formatError('NO_CHANGES', 'No changes specified.'))
    }

    if (options.dryRun) {
        printDryRun('update project', {
            Project: project.name,
            Name: args.name,
            Color: args.color,
            Favorite: args.isFavorite !== undefined ? String(args.isFavorite) : undefined,
            'View style': args.viewStyle,
        })
        return
    }

    const updated = await api.updateProject(project.id, args)

    if (options.json) {
        console.log(formatJson(updated, 'project'))
        return
    }

    if (!isQuiet()) console.log(`Updated: ${updated.name} (id:${project.id})`)
}
