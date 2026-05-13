import fs from 'node:fs'
import path from 'node:path'
import { getApi } from '../../lib/api/core.js'
import { CliError } from '../../lib/errors.js'
import { fsCodeToCliError, toFileCliError } from '../../lib/file-errors.js'
import { printDryRun } from '../../lib/output.js'
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
    projectRef: string,
    options: ImportFileOptions,
): Promise<void> {
    if (!options.file) {
        throw new CliError('MISSING_FILE', 'Template file path is required (--file)')
    }

    const filePath = path.resolve(options.file)
    if (!fs.existsSync(filePath)) {
        throw fsCodeToCliError('ENOENT', 'Template file', filePath) as CliError
    }

    if (options.dryRun) {
        printDryRun('import template into project', {
            Project: projectRef,
            File: filePath,
            'File name': options.fileName,
        })
        return
    }

    const api = await getApi()
    const project = await resolveProjectRef(api, projectRef)

    let file: Buffer
    try {
        file = fs.readFileSync(filePath) as Buffer
    } catch (err) {
        throw toFileCliError(err, 'Template file') ?? err
    }
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
