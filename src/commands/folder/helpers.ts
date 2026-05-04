import type { Folder } from '@doist/todoist-sdk'
import { getApi } from '../../lib/api/core.js'
import { fetchWorkspaces, type Workspace } from '../../lib/api/workspaces.js'
import { CliError } from '../../lib/errors.js'
import { readDefaultWorkspaceRef, resolveFolderRef, resolveWorkspaceRef } from '../../lib/refs.js'

export async function resolveWorkspaceForFolder(options: {
    workspace?: string
}): Promise<Workspace> {
    const ref = options.workspace ?? (await readDefaultWorkspaceRef())
    if (ref) {
        return resolveWorkspaceRef(ref)
    }
    const workspaces = await fetchWorkspaces()
    if (workspaces.length === 0) {
        throw new CliError(
            'WORKSPACE_NOT_FOUND',
            'No workspaces found. Folders require a workspace.',
        )
    }
    if (workspaces.length === 1) {
        return workspaces[0]
    }
    throw new CliError('WORKSPACE_NOT_FOUND', 'Multiple workspaces found. Specify --workspace.', [
        'Available workspaces:',
        ...workspaces.map((w) => `  "${w.name}" (id:${w.id})`),
        'Or set a default with `td workspace use <ref>`.',
    ])
}

export async function resolveFolderByRef(
    ref: string,
    options: { workspace?: string },
): Promise<Folder> {
    const api = await getApi()

    // id:xxx reference — fetch directly, no workspace needed
    if (ref.startsWith('id:')) {
        const id = ref.slice(3)
        return api.getFolder(id)
    }

    // Otherwise resolve via workspace-scoped folder list
    const workspace = await resolveWorkspaceForFolder(options)
    const folder = await resolveFolderRef(ref, workspace.id)

    // Fetch the full Folder object from the REST API
    return api.getFolder(folder.id)
}
