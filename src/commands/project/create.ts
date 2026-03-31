import type { ColorKey, ProjectViewStyle } from '@doist/todoist-sdk'
import chalk from 'chalk'
import { getApi, isWorkspaceProject } from '../../lib/api/core.js'
import { formatError, formatJson, printDryRun } from '../../lib/output.js'
import { resolveProjectRef } from '../../lib/refs.js'

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
        const parentProject = await resolveProjectRef(api, options.parent)
        if (isWorkspaceProject(parentProject)) {
            throw new Error(
                formatError(
                    'WORKSPACE_NO_SUBPROJECTS',
                    'Workspace projects do not support sub-projects.',
                    ['Sub-projects are only supported for personal projects.'],
                ),
            )
        }
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

    console.log(`Created: ${project.name}`)
    console.log(chalk.dim(`ID: ${project.id}`))
}
