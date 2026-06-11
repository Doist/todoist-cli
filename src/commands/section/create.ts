import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { CliError } from '../../lib/errors.js'
import { isQuiet } from '../../lib/global-args.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import { resolveProjectId } from '../../lib/refs.js'
import { readStdin } from '../../lib/stdin.js'

interface CreateOptions {
    name: string
    project: string
    description?: string
    stdin?: boolean
    json?: boolean
    dryRun?: boolean
}

export async function createSection(options: CreateOptions): Promise<void> {
    if (options.stdin && options.description !== undefined) {
        throw new CliError('CONFLICTING_OPTIONS', 'Cannot use both --description and --stdin')
    }
    let description: string | undefined
    if (options.stdin) {
        description = await readStdin()
    } else if (options.description) {
        description = options.description
    }

    if (options.dryRun) {
        printDryRun('create section', {
            Name: options.name,
            Project: options.project,
            Description: description,
        })
        return
    }

    const api = await getApi()
    const projectId = await resolveProjectId(api, options.project)

    const section = await api.addSection({
        name: options.name,
        projectId,
        ...(description !== undefined ? { description } : {}),
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
