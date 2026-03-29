import chalk from 'chalk'
import { deleteFilter } from '../../lib/api/filters.js'
import { printDryRun } from '../../lib/output.js'
import { resolveFilterRef } from './helpers.js'

export async function deleteFilterCmd(
    nameOrId: string,
    options: { yes?: boolean; dryRun?: boolean },
): Promise<void> {
    const filter = await resolveFilterRef(nameOrId)

    if (options.dryRun) {
        printDryRun('delete filter', { Filter: filter.name, Query: filter.query })
        return
    }

    if (!options.yes) {
        console.log(`Would delete: ${filter.name}`)
        console.log(chalk.dim(`Query: ${filter.query}`))
        console.log('Use --yes to confirm.')
        return
    }

    await deleteFilter(filter.id)
    console.log(`Deleted: ${filter.name}`)
}
