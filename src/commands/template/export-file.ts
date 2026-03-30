import fs from 'node:fs'
import path from 'node:path'
import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { resolveProjectRef } from '../../lib/refs.js'

export interface ExportFileOptions {
    project?: string
    relativeDates?: boolean
    output?: string
    json?: boolean
}

export async function exportTemplateFile(
    projectRef: string,
    options: ExportFileOptions,
): Promise<void> {
    const api = await getApi()
    const project = await resolveProjectRef(api, projectRef)

    const content = await api.exportTemplateAsFile({
        projectId: project.id,
        useRelativeDates: options.relativeDates,
    })

    if (options.json) {
        console.log(JSON.stringify({ content }, null, 2))
        return
    }

    if (options.output) {
        const outputPath = path.resolve(options.output)
        fs.writeFileSync(outputPath, content, 'utf-8')
        console.log(`Template written to ${outputPath}`)
        console.log(chalk.dim(`Project: ${project.name}`))
        return
    }

    process.stdout.write(content)
}
