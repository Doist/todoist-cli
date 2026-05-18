import type { Section, TodoistApi } from '@doist/todoist-sdk'
import { getApi } from '../../lib/api/core.js'
import { reorderSections } from '../../lib/api/sections-sync.js'
import { CliError } from '../../lib/errors.js'
import { isQuiet } from '../../lib/global-args.js'
import { formatJson } from '../../lib/output.js'
import { paginate } from '../../lib/pagination.js'
import { extractId, isIdRef, looksLikeRawId, resolveProjectId } from '../../lib/refs.js'

export type ReorderSectionOptions = {
    section?: string
    project?: string
    before?: string
    after?: string
    position?: number
    json?: boolean
    dryRun?: boolean
}

async function loadProjectSections(api: TodoistApi, projectId: string): Promise<Section[]> {
    const { results } = await paginate(
        (cursor, limit) => api.getSections({ projectId, cursor: cursor ?? undefined, limit }),
        { limit: Number.MAX_SAFE_INTEGER },
    )
    return results
}

function resolveSectionFromList(sections: Section[], ref: string): Section {
    if (!ref.trim()) {
        throw new CliError('INVALID_SECTION', 'section reference cannot be empty.')
    }

    if (isIdRef(ref)) {
        const id = extractId(ref)
        const match = sections.find((section) => section.id === id)
        if (!match) {
            throw new CliError('SECTION_NOT_FOUND', `Section id:${id} not found in project.`)
        }
        return match
    }

    const lower = ref.toLowerCase()
    const exact = sections.filter((section) => section.name.toLowerCase() === lower)
    if (exact.length === 1) return exact[0]
    if (exact.length > 1) {
        throw new CliError(
            'AMBIGUOUS_SECTION',
            `Multiple sections match "${ref}" exactly in project:`,
            exact.slice(0, 5).map((section) => `"${section.name}" (id:${section.id})`),
        )
    }

    const partial = sections.filter((section) => section.name.toLowerCase().includes(lower))
    if (partial.length === 1) return partial[0]
    if (partial.length > 1) {
        throw new CliError(
            'AMBIGUOUS_SECTION',
            `Multiple sections match "${ref}" in project:`,
            partial.slice(0, 5).map((section) => `"${section.name}" (id:${section.id})`),
        )
    }

    if (looksLikeRawId(ref)) {
        const byId = sections.find((section) => section.id === ref)
        if (byId) return byId
    }

    throw new CliError('SECTION_NOT_FOUND', `Section "${ref}" not found in project.`)
}

export async function reorderSection(ref: string, options: ReorderSectionOptions): Promise<void> {
    if (!options.project) {
        throw new CliError('MISSING_PROJECT', 'Specify --project <ref> to reorder a section.', [
            'Section names are scoped to a project.',
        ])
    }

    const flagCount = [options.before, options.after, options.position].filter(
        (value) => value !== undefined,
    ).length
    if (flagCount === 0) {
        throw new CliError(
            'INVALID_OPTIONS',
            'Specify exactly one of --before <ref>, --after <ref>, or --position <n>.',
        )
    }
    if (flagCount > 1) {
        throw new CliError(
            'INVALID_OPTIONS',
            '--before, --after, and --position are mutually exclusive.',
        )
    }

    const api = await getApi()
    const projectId = await resolveProjectId(api, options.project)
    const sections = (await loadProjectSections(api, projectId)).sort(
        (a, b) => a.sectionOrder - b.sectionOrder,
    )

    const target = resolveSectionFromList(sections, ref)
    const oldIndex = sections.findIndex((section) => section.id === target.id)
    if (oldIndex === -1) {
        throw new CliError('SECTION_NOT_FOUND', 'Target section not found in project.')
    }

    let newIndex: number
    if (options.position !== undefined) {
        newIndex = Math.min(options.position, sections.length - 1)
    } else {
        const siblingRef = (options.before ?? options.after) as string
        const sibling = resolveSectionFromList(sections, siblingRef)
        if (sibling.id === target.id) {
            throw new CliError('INVALID_OPTIONS', 'Cannot reorder a section relative to itself.')
        }

        const siblingIndex = sections.findIndex((section) => section.id === sibling.id)
        const adjusted = siblingIndex > oldIndex ? siblingIndex - 1 : siblingIndex
        newIndex = options.before !== undefined ? adjusted : adjusted + 1
    }

    if (newIndex === oldIndex) {
        if (options.json) {
            console.log(
                formatJson(sections.map((section, index) => sectionPosition(section, index))),
            )
            return
        }
        if (!isQuiet()) {
            console.log(`No change: "${target.name}" already at position ${oldIndex}.`)
        }
        return
    }

    const newOrder = [...sections]
    const [removed] = newOrder.splice(oldIndex, 1)
    newOrder.splice(newIndex, 0, removed)

    const items = newOrder.map((section, index) => ({
        id: section.id,
        sectionOrder: index + 1,
    }))

    if (options.dryRun) {
        console.log(`Would reorder "${target.name}": position ${oldIndex} -> ${newIndex}`)
        console.log('New section order:')
        for (let index = 0; index < newOrder.length; index++) {
            const marker = newOrder[index].id === target.id ? '>' : ' '
            console.log(`  ${marker} ${index}: ${newOrder[index].name} (id:${newOrder[index].id})`)
        }
        return
    }

    await reorderSections(items)

    if (options.json) {
        console.log(formatJson(newOrder.map((section, index) => sectionPosition(section, index))))
        return
    }

    if (!isQuiet()) {
        console.log(
            `Reordered "${target.name}" (id:${target.id}): position ${oldIndex} -> ${newIndex} of ${sections.length - 1}.`,
        )
    }
}

function sectionPosition(
    section: Section,
    position: number,
): { id: string; name: string; position: number } {
    return { id: section.id, name: section.name, position }
}
