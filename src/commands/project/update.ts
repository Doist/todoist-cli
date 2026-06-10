import { isWorkspaceProject, type ColorKey, type ProjectViewStyle } from '@doist/todoist-sdk'
import { getApi } from '../../lib/api/core.js'
import { moveProjectParent } from '../../lib/api/projects-sync.js'
import { CliError } from '../../lib/errors.js'
import { isQuiet } from '../../lib/global-args.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import { resolveProjectRef } from '../../lib/refs.js'
import { readStdin } from '../../lib/stdin.js'
import { resolveFolderByRef } from '../folder/helpers.js'
import { isDescendantOf, loadPersonalProjects, resolvePersonalParent } from './helpers.js'

export interface UpdateOptions {
    name?: string
    color?: ColorKey
    favorite?: boolean
    folder?: string | false
    parent?: string | false
    viewStyle?: string
    description?: string
    stdin?: boolean
    json?: boolean
    dryRun?: boolean
}

export async function updateProject(ref: string, options: UpdateOptions): Promise<void> {
    if (options.stdin && options.description !== undefined) {
        throw new CliError('CONFLICTING_OPTIONS', 'Cannot use both --description and --stdin')
    }

    const api = await getApi()
    const project = await resolveProjectRef(api, ref)

    // `description` is forwarded by the REST client but not yet in the SDK's
    // UpdateProjectArgs type. TODO: drop the cast once the SDK types it.
    const args: {
        name?: string
        color?: ColorKey
        isFavorite?: boolean
        folderId?: string | null
        viewStyle?: ProjectViewStyle
        description?: string
    } = {}
    if (options.name) args.name = options.name
    if (options.color) args.color = options.color
    if (options.favorite === true) args.isFavorite = true
    if (options.favorite === false) args.isFavorite = false
    if (options.viewStyle) args.viewStyle = options.viewStyle as ProjectViewStyle
    if (options.stdin) {
        args.description = await readStdin()
    } else if (options.description) {
        args.description = options.description
    }

    if (options.folder !== undefined) {
        if (!isWorkspaceProject(project)) {
            throw new CliError(
                'INVALID_OPTIONS',
                '--folder can only be used on workspace projects.',
            )
        }
        if (options.folder === false) {
            args.folderId = null
        } else {
            const folder = await resolveFolderByRef(options.folder, {
                workspace: `id:${project.workspaceId}`,
            })
            args.folderId = folder.id
        }
    }

    let newParentId: string | null | undefined
    let newParentName: string | undefined
    if (options.parent !== undefined) {
        if (isWorkspaceProject(project)) {
            throw new CliError(
                'WORKSPACE_NO_SUBPROJECTS',
                'Workspace projects cannot be nested under another project.',
                ['Sub-projects are only supported for personal projects.'],
            )
        }
        const currentParentId = project.parentId ?? null
        if (options.parent === false) {
            if (currentParentId !== null) newParentId = null
        } else {
            const parentProject = await resolvePersonalParent(api, options.parent)
            if (parentProject.id === project.id) {
                throw new CliError('INVALID_OPTIONS', 'Cannot set a project as its own parent.')
            }
            if (parentProject.id !== currentParentId) {
                const allPersonal = await loadPersonalProjects(api)
                if (isDescendantOf(allPersonal, parentProject.id, project.id)) {
                    throw new CliError(
                        'INVALID_OPTIONS',
                        `Cannot nest "${project.name}" under "${parentProject.name}": that would create a cycle.`,
                    )
                }
                newParentId = parentProject.id
                newParentName = parentProject.name
            }
        }
    }

    if (Object.keys(args).length === 0 && newParentId === undefined) {
        throw new CliError('NO_CHANGES', 'No changes specified.')
    }

    if (options.dryRun) {
        printDryRun('update project', {
            Project: project.name,
            Name: args.name,
            Color: args.color,
            Favorite: args.isFavorite !== undefined ? String(args.isFavorite) : undefined,
            Folder:
                args.folderId === null
                    ? '(none)'
                    : args.folderId !== undefined
                      ? args.folderId
                      : undefined,
            Parent:
                newParentId === null
                    ? '(none)'
                    : newParentId !== undefined
                      ? (newParentName ?? newParentId)
                      : undefined,
            'View style': args.viewStyle,
            Description: args.description,
        })
        return
    }

    let updatedName = project.name
    if (Object.keys(args).length > 0) {
        const updated = await api.updateProject(project.id, args)
        updatedName = updated.name
        if (options.json && newParentId === undefined) {
            console.log(formatJson(updated, 'project'))
            return
        }
    }

    if (newParentId !== undefined) {
        await moveProjectParent(project.id, newParentId)
    }

    if (options.json) {
        const refreshed = await resolveProjectRef(api, `id:${project.id}`)
        console.log(formatJson(refreshed, 'project'))
        return
    }

    if (!isQuiet()) {
        let msg = `Updated: ${updatedName} (id:${project.id})`
        if (newParentId === null) {
            msg += ' → moved to top level'
        } else if (newParentId !== undefined) {
            msg += ` → moved under "${newParentName}"`
        }
        console.log(msg)
    }
}
