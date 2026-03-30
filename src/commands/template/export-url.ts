import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { resolveProjectRef } from '../../lib/refs.js'

export interface ExportUrlOptions {
    project?: string
    relativeDates?: boolean
    json?: boolean
}

export async function exportTemplateUrl(
    projectRef: string,
    options: ExportUrlOptions,
): Promise<void> {
    const api = await getApi()
    const project = await resolveProjectRef(api, projectRef)

    const result = await api.exportTemplateAsUrl({
        projectId: project.id,
        useRelativeDates: options.relativeDates,
    })

    if (options.json) {
        console.log(JSON.stringify(result, null, 2))
        return
    }

    console.log(`File: ${result.fileName}`)
    console.log(`URL: ${result.fileUrl}`)
    console.log(chalk.dim(`Project: ${project.name}`))
}
