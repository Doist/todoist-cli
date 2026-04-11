import { getApi } from '../../lib/api/core.js'
import { resolveWorkspaceRef } from '../../lib/refs.js'

export async function archivedCount(options: {
    workspace?: string
    joined?: boolean
    json?: boolean
}): Promise<void> {
    const api = await getApi()

    const args: { workspaceId?: string; joined?: boolean } = {}
    let workspaceName: string | undefined
    if (options.workspace) {
        const workspace = await resolveWorkspaceRef(options.workspace)
        args.workspaceId = workspace.id
        workspaceName = workspace.name
    }
    if (options.joined) {
        args.joined = true
    }

    const result = await api.getArchivedProjectsCount(args)

    if (options.json) {
        console.log(JSON.stringify(result, null, 2))
        return
    }

    let output = `Archived projects: ${result.count}`
    if (workspaceName) {
        output += ` (workspace: ${workspaceName})`
    }
    console.log(output)
}
