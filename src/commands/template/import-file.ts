import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { getApi } from '../../lib/api/core.js'
import { CliError } from '../../lib/errors.js'
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

    let buffer: Buffer
    try {
        buffer = await readFile(filePath)
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            throw new CliError('FILE_NOT_FOUND', `Template file not found: ${filePath}`, [
                'Check the file path and try again.',
            ])
        }
        const message = err instanceof Error ? err.message : String(err)
        throw new CliError('FILE_READ_ERROR', `Cannot read template file: ${filePath}`, [message])
    }
    const fileName = options.fileName || path.basename(filePath)
    const file = new Blob([new Uint8Array(buffer)])

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
