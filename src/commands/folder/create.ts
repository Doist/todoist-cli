import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { isQuiet } from '../../lib/global-args.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import { resolveWorkspaceRef } from '../../lib/refs.js'

interface CreateFolderOptions {
    name: string
    workspace?: string
    defaultOrder?: string
    childOrder?: string
    json?: boolean
    dryRun?: boolean
}

export async function createFolder(
    workspaceRef: string,
    options: CreateFolderOptions,
): Promise<void> {
    if (options.dryRun) {
        printDryRun('create folder', {
            Name: options.name,
            Workspace: workspaceRef,
            'Default order': options.defaultOrder,
            'Child order': options.childOrder,
        })
        return
    }

    const workspace = await resolveWorkspaceRef(workspaceRef)
    const api = await getApi()

    const folder = await api.addFolder({
        name: options.name,
        workspaceId: workspace.id,
        defaultOrder: options.defaultOrder ? parseInt(options.defaultOrder, 10) : undefined,
        childOrder: options.childOrder ? parseInt(options.childOrder, 10) : undefined,
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
