import type { ColorKey, ProjectViewStyle } from '@doist/todoist-sdk'
import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { isQuiet } from '../../lib/global-args.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import { resolvePersonalParent } from './helpers.js'

export interface CreateOptions {
    name: string
    color?: ColorKey
    favorite?: boolean
    parent?: string
    viewStyle?: string
    json?: boolean
    dryRun?: boolean
}

export async function createProject(options: CreateOptions): Promise<void> {
    if (options.dryRun) {
        printDryRun('create project', {
            Name: options.name,
            Color: options.color,
            Favorite: options.favorite ? 'yes' : undefined,
            Parent: options.parent,
            'View style': options.viewStyle,
        })
        return
    }

    const api = await getApi()

    let parentId: string | undefined
    if (options.parent) {
        const parentProject = await resolvePersonalParent(api, options.parent)
        parentId = parentProject.id
    }

    const project = await api.addProject({
        name: options.name,
        color: options.color,
        isFavorite: options.favorite,
        parentId,
        viewStyle: options.viewStyle as ProjectViewStyle,
    })

    if (options.json) {
        console.log(formatJson(project, 'project'))
        return
    }

    if (isQuiet()) {
        console.log(project.id)
        return
    }

    console.log(`Created: ${project.name}`)
    console.log(chalk.dim(`ID: ${project.id}`))
}
