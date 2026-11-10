import { type Filter, fetchFilters } from '../../lib/api/filters.js'
import { CliError } from '../../lib/errors.js'
import { getRequestedUserRef } from '../../lib/global-args.js'
import { isIdRef, lenientIdRef, looksLikeRawId, parseTodoistUrl } from '../../lib/refs.js'

export async function resolveFilterRef(nameOrId: string): Promise<Filter> {
    const filters = await fetchFilters()

    if (parseTodoistUrl(nameOrId) || isIdRef(nameOrId)) {
        const id = lenientIdRef(nameOrId, 'filter')
        const filter = filters.find((f) => f.id === id)
        if (!filter) throw new CliError('FILTER_NOT_FOUND', 'Filter not found.')
        return filter
    }

    const lower = nameOrId.toLowerCase()
    const exact = filters.find((f) => f.name.toLowerCase() === lower)
    if (exact) return exact

    const partial = filters.filter((f) => f.name.toLowerCase().includes(lower))
    if (partial.length === 1) return partial[0]
    if (partial.length > 1) {
        throw new CliError('AMBIGUOUS_FILTER', `Multiple filters match "${nameOrId}".`, [
            'Use id:xxx to specify exactly',
            ...partial.slice(0, 5).map((f) => `${f.name} (id:${f.id})`),
        ])
    }

    if (looksLikeRawId(nameOrId)) {
        const byId = filters.find((f) => f.id === nameOrId)
        if (byId) return byId
    }

    throw new CliError('FILTER_NOT_FOUND', `Filter "${nameOrId}" not found.`)
}

/**
 * A `td` command line for a hint. It keeps `--user`, so the command reaches the
 * account the filter is in rather than the default one.
 */
export function tdCommand(...args: string[]): string {
    const user = getRequestedUserRef()
    return ['td', ...(user ? ['--user', user] : []), ...args].join(' ')
}
