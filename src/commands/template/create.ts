import fs from 'node:fs'
import path from 'node:path'
import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { formatError, printDryRun } from '../../lib/output.js'
import { resolveWorkspaceRef } from '../../lib/refs.js'
import { formatImportResult } from './helpers.js'

export interface CreateFromTemplateOptions {
    name: string
    file: string
    fileName?: string
    workspace?: string
    json?: boolean
    dryRun?: boolean
}

export async function createFromTemplate(options: CreateFromTemplateOptions): Promise<void> {
    if (!options.name) {
        throw new Error(formatError('MISSING_NAME', 'Project name is required (--name)'))
    }
    if (!options.file) {
        throw new Error(formatError('MISSING_FILE', 'Template file path is required (--file)'))
    }

    const filePath = path.resolve(options.file)
    if (!fs.existsSync(filePath)) {
        throw new Error(
            formatError('FILE_NOT_FOUND', `Template file not found: ${filePath}`, [
                'Check the file path and try again.',
            ]),
        )
    }

    if (options.dryRun) {
        printDryRun('create project from template', {
            Name: options.name,
            File: filePath,
            'File name': options.fileName,
            Workspace: options.workspace,
        })
        return
    }

    const api = await getApi()

    let workspaceId: string | undefined
    if (options.workspace) {
        const workspace = await resolveWorkspaceRef(options.workspace)
        workspaceId = workspace.id
    }

    let file: Buffer
    try {
        file = fs.readFileSync(filePath) as Buffer
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        throw new Error(
            formatError('FILE_READ_ERROR', `Cannot read template file: ${filePath}`, [message]),
        )
    }
    const fileName = options.fileName || path.basename(filePath)

    const result = await api.createProjectFromTemplate({
        name: options.name,
        file,
        fileName,
        workspaceId,
    })

    if (options.json) {
        console.log(JSON.stringify(result, null, 2))
        return
    }

    console.log(`Created project: ${options.name}`)
    console.log(chalk.dim(`ID: ${result.projectId}`))
    formatImportResult(result)
}
