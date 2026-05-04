import { getApi } from '../../lib/api/core.js'
import { clearWorkspaceCache } from '../../lib/api/workspaces.js'
import { isQuiet } from '../../lib/global-args.js'
import { printDryRun } from '../../lib/output.js'
import { resolveWorkspaceRef } from '../../lib/refs.js'
import { assertWorkspaceAdmin } from './helpers.js'

export async function deleteWorkspaceCommand(
    ref: string | undefined,
    options: { yes?: boolean; dryRun?: boolean },
): Promise<void> {
    const workspace = await resolveWorkspaceRef(ref)
    // Admin check runs before dry-run so the preview can't silently
    // claim a delete would succeed when the server would reject it.
    assertWorkspaceAdmin(workspace, 'delete')

    if (options.dryRun) {
        printDryRun('delete workspace', {
            Workspace: workspace.name,
            ID: workspace.id,
        })
        return
    }

    if (!options.yes) {
        console.log(`Would delete: ${workspace.name} (id:${workspace.id})`)
        console.log('Use --yes to confirm.')
        return
    }

    const api = await getApi()
    await api.deleteWorkspace(workspace.id)
    clearWorkspaceCache()

    if (!isQuiet()) {
        console.log(`Deleted: ${workspace.name} (id:${workspace.id})`)
    }
}
