import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { CliError } from '../../lib/errors.js'
import { openLocalFileAsBlob } from '../../lib/local-file.js'
import { printDryRun } from '../../lib/output.js'
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
        throw new CliError('MISSING_NAME', 'Project name is required (--name)')
    }
    if (!options.file) {
        throw new CliError('MISSING_FILE', 'Template file path is required (--file)')
    }

    const {
        blob: file,
        filePath,
        fileName: defaultFileName,
    } = await openLocalFileAsBlob(options.file)
    const fileName = options.fileName || defaultFileName

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
