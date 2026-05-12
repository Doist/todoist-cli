import { isWorkspaceProject, type ColorKey, type ProjectViewStyle } from '@doist/todoist-sdk'
import { getApi } from '../../lib/api/core.js'
import { moveProjectParent } from '../../lib/api/projects-sync.js'
import { CliError } from '../../lib/errors.js'
import { isQuiet } from '../../lib/global-args.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import { resolveProjectRef } from '../../lib/refs.js'
import { resolveFolderByRef } from '../folder/helpers.js'

export interface UpdateOptions {
    name?: string
    color?: ColorKey
    favorite?: boolean
    folder?: string | false
    parent?: string | false
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
        folderId?: string | null
        viewStyle?: ProjectViewStyle
    } = {}
    if (options.name) args.name = options.name
    if (options.color) args.color = options.color
    if (options.favorite === true) args.isFavorite = true
    if (options.favorite === false) args.isFavorite = false
    if (options.viewStyle) args.viewStyle = options.viewStyle as ProjectViewStyle

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
                'Workspace projects do not support sub-projects.',
                ['Sub-projects are only supported for personal projects.'],
            )
        }
        if (options.parent === false) {
            newParentId = null
        } else {
            const parentProject = await resolveProjectRef(api, options.parent)
            if (isWorkspaceProject(parentProject)) {
                throw new CliError(
                    'WORKSPACE_NO_SUBPROJECTS',
                    'Workspace projects cannot be used as parent.',
                    ['Sub-projects are only supported under personal projects.'],
                )
            }
            if (parentProject.id === project.id) {
                throw new CliError('INVALID_OPTIONS', 'Cannot set a project as its own parent.')
            }
            newParentId = parentProject.id
            newParentName = parentProject.name
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
