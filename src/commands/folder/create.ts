import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { isQuiet } from '../../lib/global-args.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import { resolveWorkspaceRef } from '../../lib/refs.js'

interface CreateFolderOptions {
    name: string
    workspace?: string
    defaultOrder?: number
    childOrder?: number
    json?: boolean
    dryRun?: boolean
}

export async function createFolder(
    workspaceRef: string | undefined,
    options: CreateFolderOptions,
): Promise<void> {
    // Resolve up front so --dry-run previews the workspace by its real name
    // and still fails fast on an unknown ref or missing default.
    const workspace = await resolveWorkspaceRef(workspaceRef)

    if (options.dryRun) {
        printDryRun('create folder', {
            Name: options.name,
            Workspace: workspace.name,
            'Default order':
                options.defaultOrder !== undefined ? String(options.defaultOrder) : undefined,
            'Child order':
                options.childOrder !== undefined ? String(options.childOrder) : undefined,
        })
        return
    }

    const api = await getApi()

    const folder = await api.addFolder({
        name: options.name,
        workspaceId: workspace.id,
        defaultOrder: options.defaultOrder,
        childOrder: options.childOrder,
    })

    if (options.json) {
        console.log(formatJson(folder, 'folder'))
        return
    }

    if (isQuiet()) {
        console.log(folder.id)
        return
    }

    console.log(`Created: ${folder.name}`)
    console.log(chalk.dim(`ID: ${folder.id}`))
}
