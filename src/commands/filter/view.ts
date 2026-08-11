import chalk from 'chalk'
import { getApi, type Project, type Task } from '../../lib/api/core.js'
import { CollaboratorCache, formatAssignee } from '../../lib/collaborators.js'
import { CliError } from '../../lib/errors.js'
import type { PaginatedViewOptions } from '../../lib/options.js'
import {
    formatNextCursorFooter,
    formatJson,
    formatNdjson,
    formatPaginatedJson,
    formatPaginatedNdjson,
    formatTaskRow,
    processJsonItem,
} from '../../lib/output.js'
import { LIMITS, paginate } from '../../lib/pagination.js'
import { filterUrl } from '../../lib/urls.js'
import { resolveFilterRef } from './helpers.js'

interface FilterSection {
    query: string
    results: Task[]
    nextCursor: string | null
}

const FILTER_SECTION_CONCURRENCY = 6

/**
 * Split Todoist's multi-list filter syntax without reimplementing its query parser.
 * Todoist defines each unescaped comma as a list separator and uses backslashes
 * to escape special characters. Preserve those escapes for the API subqueries.
 */
export function splitFilterQueries(query: string): string[] {
    const sections: string[] = []
    let current = ''
    let escaped = false

    for (const character of query) {
        if (character === ',' && !escaped) {
            const section = current.trim()
            if (section) sections.push(section)
            current = ''
            continue
        }

        current += character
        escaped = character === '\\' ? !escaped : false
    }

    const section = current.trim()
    if (section) sections.push(section)

    return sections.length > 0 ? sections : [query]
}

function formatFilterSectionsJson(
    sections: FilterSection[],
    full = false,
    showUrls = false,
): string {
    return formatJson({ sections: processFilterSections(sections, full, showUrls) })
}

function formatFilterSectionsNdjson(
    sections: FilterSection[],
    full = false,
    showUrls = false,
): string {
    return formatNdjson(processFilterSections(sections, full, showUrls))
}

function processFilterSections(sections: FilterSection[], full: boolean, showUrls: boolean) {
    return sections.map((section) => ({
        query: section.query,
        results: section.results.map((task) => processJsonItem(task, 'task', full, showUrls)),
        nextCursor: section.nextCursor,
    }))
}

async function mapFilterSections(
    queries: string[],
    loadSection: (query: string) => Promise<FilterSection>,
): Promise<FilterSection[]> {
    const sections: FilterSection[] = []
    let nextIndex = 0

    // Workers claim indexes before awaiting, which caps request bursts while keeping
    // results in saved-filter order even when later sections finish first.
    const workers = Array.from(
        { length: Math.min(FILTER_SECTION_CONCURRENCY, queries.length) },
        async () => {
            while (nextIndex < queries.length) {
                const index = nextIndex++
                sections[index] = await loadSection(queries[index])
            }
        },
    )
    await Promise.all(workers)
    return sections
}

export async function showFilter(nameOrId: string, options: PaginatedViewOptions): Promise<void> {
    const filter = await resolveFilterRef(nameOrId)
    const api = await getApi()

    const targetLimit = options.all
        ? Number.MAX_SAFE_INTEGER
        : options.limit
          ? parseInt(options.limit, 10)
          : LIMITS.tasks

    const queries = splitFilterQueries(filter.query)
    const hasMultipleSections = queries.length > 1

    if (hasMultipleSections && options.cursor) {
        throw new CliError(
            'INVALID_OPTIONS',
            'Cannot use --cursor with a filter that has multiple sections.',
            ['Each filter section has its own cursor; use --all or query one section directly'],
        )
    }

    let sections: FilterSection[]

    try {
        // Section cursors are independent; pages within one section remain serial.
        // Any section failure rejects the view so partial output never looks complete.
        sections = await mapFilterSections(queries, async (query) => {
            const result = await paginate(
                (cursor, limit) =>
                    api.getTasksByFilter({
                        query,
                        cursor: cursor ?? undefined,
                        limit,
                    }),
                { limit: targetLimit, startCursor: options.cursor },
            )
            return { query, ...result }
        })
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (message.includes('400')) {
            throw new CliError(
                'INVALID_FILTER_QUERY',
                `Filter query "${filter.query}" is invalid.`,
                ['Check the Todoist filter syntax'],
            )
        }
        throw err
    }

    if (options.json) {
        if (hasMultipleSections) {
            console.log(formatFilterSectionsJson(sections, options.full, options.showUrls))
            return
        }
        const [section] = sections
        console.log(
            formatPaginatedJson(
                { results: section.results, nextCursor: section.nextCursor },
                'task',
                options.full,
                options.showUrls,
            ),
        )
        return
    }

    if (options.ndjson) {
        if (hasMultipleSections) {
            console.log(formatFilterSectionsNdjson(sections, options.full, options.showUrls))
            return
        }
        const [section] = sections
        console.log(
            formatPaginatedNdjson(
                { results: section.results, nextCursor: section.nextCursor },
                'task',
                options.full,
                options.showUrls,
            ),
        )
        return
    }

    // Do not deduplicate: Todoist can intentionally show one task in multiple lists.
    const tasks = sections.flatMap((section) => section.results)

    console.log(chalk.bold(`${filter.name}`))
    console.log(chalk.dim(`Query: ${filter.query}`))
    console.log(chalk.dim(`URL:   ${filterUrl(filter.id)}`))
    console.log('')

    if (tasks.length === 0) {
        if (!hasMultipleSections) {
            console.log('No tasks match this filter.')
            console.log(formatNextCursorFooter(sections[0].nextCursor))
            return
        }
    }

    const projectMap = new Map<string, Project>()
    const collaboratorCache = new CollaboratorCache()
    if (tasks.length > 0) {
        const { results: projects } = await api.getProjects()
        for (const project of projects) projectMap.set(project.id, project)
        await collaboratorCache.preload(api, tasks, projectMap)
    }

    for (const [index, section] of sections.entries()) {
        if (hasMultipleSections) {
            console.log(chalk.bold(`--- ${section.query} ---`))
        }

        if (section.results.length === 0) {
            console.log('No tasks match this section.')
        } else {
            for (const task of section.results) {
                const assignee = formatAssignee({
                    userId: task.responsibleUid,
                    projectId: task.projectId,
                    projects: projectMap,
                    cache: collaboratorCache,
                })
                console.log(
                    await formatTaskRow({
                        task,
                        projectName: projectMap.get(task.projectId)?.name,
                        assignee: assignee ?? undefined,
                        showUrl: options.showUrls,
                    }),
                )
                console.log('')
            }
        }

        const footer = formatNextCursorFooter(section.nextCursor)
        if (footer) console.log(footer)
        if (
            hasMultipleSections &&
            index < sections.length - 1 &&
            (section.results.length === 0 || footer)
        ) {
            console.log('')
        }
    }
}
