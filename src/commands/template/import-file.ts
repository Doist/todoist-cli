import fs from 'node:fs'
import path from 'node:path'
import { getApi } from '../../lib/api/core.js'
import { formatError, printDryRun } from '../../lib/output.js'
import { resolveProjectRef } from '../../lib/refs.js'
import { formatImportResult } from './helpers.js'

export interface ImportFileOptions {
    project?: string
    file: string
    fileName?: string
    json?: boolean
    dryRun?: boolean
}

export async function importTemplateFile(
    projectArg: string | undefined,
    options: ImportFileOptions,
): Promise<void> {
    const ref = projectArg || options.project
    if (!ref) {
        throw new Error('Project reference is required')
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
        printDryRun('import template into project', {
            Project: ref,
            File: filePath,
            'File name': options.fileName,
        })
        return
    }

    const api = await getApi()
    const project = await resolveProjectRef(api, ref)

    const file = fs.readFileSync(filePath)
    const fileName = options.fileName || path.basename(filePath)

    const result = await api.importTemplateIntoProject({
        projectId: project.id,
        file,
        fileName,
    })

    if (options.json) {
        console.log(JSON.stringify(result, null, 2))
        return
    }

    formatImportResult(result)
}
