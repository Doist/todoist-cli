import { getApi } from '../../lib/api/core.js'
import { CliError } from '../../lib/errors.js'
import { isQuiet } from '../../lib/global-args.js'
import { formatJson, printDryRun } from '../../lib/output.js'
import { lenientIdRef } from '../../lib/refs.js'
import { readStdin } from '../../lib/stdin.js'

interface UpdateOptions {
    name?: string
    description?: string
    stdin?: boolean
    json?: boolean
    dryRun?: boolean
}

export async function updateSection(sectionId: string, options: UpdateOptions): Promise<void> {
    if (options.stdin && options.description !== undefined) {
        throw new CliError('CONFLICTING_OPTIONS', 'Cannot use both --description and --stdin')
    }
    const id = lenientIdRef(sectionId, 'section')

    // SDK dependency: UpdateSectionArgs requires `name` and omits `description`,
    // so the args type lists exactly the two fields we send. The cast at the
    // call site bridges to the SDK signature until it models both.
    const args: { name?: string; description?: string } = {}
    if (options.name) args.name = options.name
    if (options.stdin) {
        args.description = await readStdin()
    } else if (options.description) {
        args.description = options.description
    }

    if (Object.keys(args).length === 0) {
        throw new CliError('NO_CHANGES', 'No changes specified.')
    }

    if (options.dryRun) {
        printDryRun('update section', {
            ID: id,
            Name: args.name,
            Description: args.description,
        })
        return
    }

    const api = await getApi()
    // Cast covers the SDK gap above; the REST client forwards the extra fields.
    const updateArgs = args as Parameters<typeof api.updateSection>[1]

    if (options.json) {
        const updated = await api.updateSection(id, updateArgs)
        console.log(formatJson(updated, 'section'))
        return
    }

    // Only fetch the existing section when renaming, to show "old → new".
    // Description-only updates skip the extra blocking request.
    const previousName = args.name ? (await api.getSection(id)).name : undefined
    const updated = await api.updateSection(id, updateArgs)
    if (!isQuiet()) {
        const label = previousName ? `${previousName} → ${updated.name}` : updated.name
        console.log(`Updated: ${label} (id:${id})`)
    }
}
