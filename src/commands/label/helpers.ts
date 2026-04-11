import type { Label } from '@doist/todoist-sdk'
import { getApi } from '../../lib/api/core.js'
import { CliError } from '../../lib/errors.js'
import { paginate } from '../../lib/pagination.js'
import { isIdRef, lenientIdRef, looksLikeRawId, parseTodoistUrl } from '../../lib/refs.js'

// Resolves a shared label name by checking it exists in the shared labels list.
// Returns the canonical casing of the label name.
export async function resolveSharedLabelName(nameArg: string): Promise<string> {
    const name = nameArg.startsWith('@') ? nameArg.slice(1) : nameArg
    const lower = name.toLowerCase()

    const api = await getApi()
    const { results: sharedLabels } = await paginate(
        (cursor, limit) => api.getSharedLabels({ cursor: cursor ?? undefined, limit }),
        { limit: Number.MAX_SAFE_INTEGER },
    )

    const match = sharedLabels.find((s) => s.toLowerCase() === lower)
    if (!match) throw new CliError('LABEL_NOT_FOUND', `Shared label "${name}" not found.`)
    return match
}

// Resolves a label ref to a personal Label object. Used by delete/update/browse
// which require an ID. Does NOT fall back to shared labels — use
// resolveLabelNameForView() for view which only needs a name.
export async function resolveLabelRef(nameOrId: string): Promise<Label> {
    const api = await getApi()
    const { results: labels } = await api.getLabels()

    if (parseTodoistUrl(nameOrId) || isIdRef(nameOrId)) {
        const id = lenientIdRef(nameOrId, 'label')
        const label = labels.find((l) => l.id === id)
        if (!label) throw new CliError('LABEL_NOT_FOUND', 'Label not found.')
        return label
    }

    const name = nameOrId.startsWith('@') ? nameOrId.slice(1) : nameOrId
    const lower = name.toLowerCase()
    const exact = labels.find((l) => l.name.toLowerCase() === lower)
    if (exact) return exact

    if (looksLikeRawId(nameOrId)) {
        const byId = labels.find((l) => l.id === nameOrId)
        if (byId) return byId
    }

    throw new CliError('LABEL_NOT_FOUND', `Label "${nameOrId}" not found.`)
}

export interface ResolvedLabelForView {
    name: string
    label: Label | null // null for shared-only labels
}

// Resolves a label ref for viewing. Falls back to shared labels when no
// personal label matches, since view only needs a name for the filter query.
export async function resolveLabelNameForView(nameOrId: string): Promise<ResolvedLabelForView> {
    const api = await getApi()
    const { results: labels } = await api.getLabels()

    // URL or id: ref → must be a personal label (shared labels have no IDs)
    if (parseTodoistUrl(nameOrId) || isIdRef(nameOrId)) {
        const id = lenientIdRef(nameOrId, 'label')
        const label = labels.find((l) => l.id === id)
        if (!label) throw new CliError('LABEL_NOT_FOUND', 'Label not found.')
        return { name: label.name, label }
    }

    const name = nameOrId.startsWith('@') ? nameOrId.slice(1) : nameOrId
    const lower = name.toLowerCase()

    // Personal label by name (case-insensitive)
    const exact = labels.find((l) => l.name.toLowerCase() === lower)
    if (exact) return { name: exact.name, label: exact }

    // Raw ID fallback in personal labels
    if (looksLikeRawId(nameOrId)) {
        const byId = labels.find((l) => l.id === nameOrId)
        if (byId) return { name: byId.name, label: byId }
    }

    // Shared labels fallback — fetch and find by name
    const { results: sharedLabels } = await paginate(
        (cursor, limit) => api.getSharedLabels({ cursor: cursor ?? undefined, limit }),
        { limit: Number.MAX_SAFE_INTEGER },
    )
    const sharedMatch = sharedLabels.find((s) => s.toLowerCase() === lower)
    if (sharedMatch) return { name: sharedMatch, label: null }

    throw new CliError('LABEL_NOT_FOUND', `Label "${nameOrId}" not found.`)
}
