import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { isQuiet } from '../../lib/global-args.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import { resolveProjectId } from '../../lib/refs.js'

interface CreateOptions {
    name: string
    project: string
    json?: boolean
    dryRun?: boolean
}

export async function createSection(options: CreateOptions): Promise<void> {
    if (options.dryRun) {
        printDryRun('create section', {
            Name: options.name,
            Project: options.project,
        })
        return
    }

    const api = await getApi()
    const projectId = await resolveProjectId(api, options.project)

    const section = await api.addSection({
        name: options.name,
        projectId,
    })

    if (options.json) {
        console.log(formatJson(section, 'section'))
        return
    }

    if (isQuiet()) {
        console.log(section.id)
        return
    }

    console.log(`Created: ${section.name}`)
    console.log(chalk.dim(`ID: ${section.id}`))
}
