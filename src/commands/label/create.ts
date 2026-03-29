import type { ColorKey } from '@doist/todoist-api-typescript'
import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { formatJson, printDryRun } from '../../lib/output.js'

export interface CreateOptions {
    name: string
    color?: ColorKey
    favorite?: boolean
    json?: boolean
    dryRun?: boolean
}

export async function createLabel(options: CreateOptions): Promise<void> {
    if (options.dryRun) {
        printDryRun('create label', {
            Name: `@${options.name}`,
            Color: options.color,
            Favorite: options.favorite ? 'yes' : undefined,
        })
        return
    }

    const api = await getApi()

    const label = await api.addLabel({
        name: options.name,
        color: options.color,
        isFavorite: options.favorite,
    })

    if (options.json) {
        console.log(formatJson(label, 'label'))
        return
    }

    console.log(`Created: @${label.name}`)
    console.log(chalk.dim(`ID: ${label.id}`))
}
