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

    const args: { name?: string; description?: string | null } = {}
    if (options.name) args.name = options.name
    if (options.stdin) {
        // Empty stdin clears the description (backend NULL_CLEARS); non-empty sets it.
        const piped = await readStdin()
        args.description = piped === '' ? null : piped
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
            Description: args.description === null ? '(cleared)' : args.description,
        })
        return
    }

    const api = await getApi()
    // The SDK's UpdateSectionArgs is RequireAtLeastOne, which a dynamically-built
    // partial can't satisfy statically; the NO_CHANGES guard above guarantees at
    // least one field is set at runtime.
    const updateArgs = args as Parameters<typeof api.updateSection>[1]

    if (options.json) {
        const updated = await api.updateSection(id, updateArgs)
        console.log(formatJson(updated, 'section'))
        return
    }

    // Only fetch the existing section when renaming AND we'll print the result,
    // to show "old → new". Description-only or quiet updates skip the roundtrip.
    const previousName = args.name && !isQuiet() ? (await api.getSection(id)).name : undefined
    const updated = await api.updateSection(id, updateArgs)
    if (!isQuiet()) {
        const label = previousName ? `${previousName} → ${updated.name}` : updated.name
        console.log(`Updated: ${label} (id:${id})`)
    }
}
