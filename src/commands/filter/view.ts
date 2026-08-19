import {
    findViewOptions,
    isWorkspaceProject,
    type TodoistApi,
    type ViewOptions as SavedViewOptions,
} from '@doist/todoist-sdk'
import chalk from 'chalk'
import { getAccountTimezone, getApi, type Project, type Task } from '../../lib/api/core.js'
import { fetchWorkspaces } from '../../lib/api/workspaces.js'
import { CollaboratorCache, formatAssignee } from '../../lib/collaborators.js'
import { CliError } from '../../lib/errors.js'
import { getLogger } from '../../lib/logger.js'
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
import { fetchProjects } from '../../lib/task-list.js'
import {
    buildProjectOrder,
    defaultDirectionFor,
    formatTaskSort,
    parseTaskSortDirection,
    parseTaskSortField,
    queryUsesDates,
    sortNeedsCollaborators,
    sortNeedsProjects,
    sortTasks,
    type TaskSort,
    type TaskSortDirection,
    type TaskSortField,
    taskSortFromViewOptions,
} from '../../lib/task-sort.js'
import { filterUrl } from '../../lib/urls.js'
import { resolveFilterRef } from './helpers.js'

export interface FilterViewOptions extends PaginatedViewOptions {
    sort?: string
    sortOrder?: string
}

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

/**
 * Flag beats saved view, saved view beats the Todoist default. `--sort-order`
 * on its own re-points the direction of whichever field is already in play.
 */
function resolveSort(
    filterId: string,
    requested: { field?: TaskSortField; direction?: TaskSortDirection },
    viewOptions: SavedViewOptions[],
): TaskSort {
    if (requested.field) {
        return {
            field: requested.field,
            direction: requested.direction ?? defaultDirectionFor(requested.field),
        }
    }

    const saved = taskSortFromViewOptions(
        findViewOptions(viewOptions, {
            viewTypes: ['FILTER', 'WORKSPACE_FILTER'],
            objectId: filterId,
        }),
    )
    return requested.direction ? { field: saved.field, direction: requested.direction } : saved
}

/**
 * A view-options failure shouldn't cost you the list, the way a collaborator
 * lookup failure doesn't cost you a task's name. It does change what the
 * ordering means though, so the caller says so in the header rather than
 * passing off the default hierarchy as the view's own sorting.
 */
async function loadViewOptions(
    api: TodoistApi,
): Promise<{ viewOptions: SavedViewOptions[]; unavailable: boolean }> {
    try {
        return { viewOptions: await api.getViewOptions(), unavailable: false }
    } catch (error) {
        getLogger().detail('failed to load saved view options', {
            error: error instanceof Error ? error.message : String(error),
        })
        return { viewOptions: [], unavailable: true }
    }
}

/**
 * Workspace names order the workspace buckets the way the sidebar and
 * `td project list` do. Only worth a request when more than one workspace is
 * represented, since a single bucket has nothing to sort against.
 */
async function loadWorkspaceNames(
    projects: Map<string, Project>,
): Promise<Map<string, string> | undefined> {
    const workspaceIds = new Set<string>()
    for (const project of projects.values()) {
        if (isWorkspaceProject(project)) workspaceIds.add(project.workspaceId)
    }
    if (workspaceIds.size < 2) return undefined

    try {
        const workspaces = await fetchWorkspaces()
        return new Map(workspaces.map((workspace) => [workspace.id, workspace.name]))
    } catch (error) {
        getLogger().detail('failed to load workspaces for sort order', {
            error: error instanceof Error ? error.message : String(error),
        })
        return undefined
    }
}

export async function showFilter(nameOrId: string, options: FilterViewOptions): Promise<void> {
    const requested = {
        field: options.sort ? parseTaskSortField(options.sort) : undefined,
        direction: options.sortOrder ? parseTaskSortDirection(options.sortOrder) : undefined,
    }
    const api = await getApi()

    // An explicit --sort makes the saved view options moot, so only pay for
    // them when they can still change the order.
    const [filter, saved] = await Promise.all([
        resolveFilterRef(nameOrId),
        requested.field
            ? Promise.resolve({ viewOptions: [] as SavedViewOptions[], unavailable: false })
            : loadViewOptions(api),
    ])
    const sort = resolveSort(filter.id, requested, saved.viewOptions)

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

    // Sorting happens here, over whatever came back. A cursor hands us a slice
    // of the middle of the API's own order, so sorting it would produce a page
    // that belongs to no ordering at all.
    if (options.cursor && sort.field !== 'none') {
        throw new CliError(
            'INVALID_OPTIONS',
            'Cannot use --cursor while the results are being sorted.',
            [
                'Use --all to sort the whole filter',
                'Or pass --sort none to page through the API order',
            ],
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

    // Do not deduplicate: Todoist can intentionally show one task in multiple lists.
    const tasks = sections.flatMap((section) => section.results)
    const isPretty = !options.json && !options.ndjson

    // Rendering needs the projects and collaborators for every task; sorting
    // needs them, plus the account timezone, only for some fields. Fetch when
    // either side asks, never when there is nothing to order or draw.
    const needsProjects = tasks.length > 0 && (isPretty || sortNeedsProjects(sort.field))
    const sorting = tasks.length > 0 && sort.field !== 'none'
    const [projectMap, timezone] = await Promise.all([
        needsProjects ? fetchProjects(api) : Promise.resolve(new Map<string, Project>()),
        sorting ? getAccountTimezone() : Promise.resolve(undefined),
    ])
    const collaboratorCache = new CollaboratorCache()
    if (tasks.length > 0 && (isPretty || sortNeedsCollaborators(sort.field))) {
        await collaboratorCache.preload(api, tasks, projectMap)
    }

    // Each section is its own list in the Todoist apps, sorted on its own.
    if (sorting) {
        const projectOrder = buildProjectOrder(projectMap.values(), {
            workspaceNames: await loadWorkspaceNames(projectMap),
        })
        sections = sections.map((section) => ({
            ...section,
            results: sortTasks(section.results, sort, {
                ...projectOrder,
                timezone,
                dateDriven: queryUsesDates(section.query),
                assigneeName: (task) =>
                    task.responsibleUid
                        ? (collaboratorCache.getUserName({
                              userId: task.responsibleUid,
                              projectId: task.projectId,
                              projects: projectMap,
                          }) ?? task.responsibleUid)
                        : null,
            }),
        }))
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

    console.log(chalk.bold(`${filter.name}`))
    console.log(chalk.dim(`Query: ${filter.query}`))
    console.log(chalk.dim(`URL:   ${filterUrl(filter.id)}`))
    const truncated = sections.some((section) => section.nextCursor)
    const sortNotes = [
        saved.unavailable ? 'saved view options unavailable' : null,
        // The order can only be right across the tasks we actually hold. A task
        // still behind a cursor can outrank everything on screen.
        sorting && truncated ? `ordered over the ${tasks.length} tasks fetched, use --all` : null,
    ].filter(Boolean)
    const sortNote = sortNotes.length > 0 ? ` (${sortNotes.join('; ')})` : ''
    console.log(chalk.dim(`Sort:  ${formatTaskSort(sort)}${sortNote}`))
    console.log('')

    if (tasks.length === 0) {
        if (!hasMultipleSections) {
            console.log('No tasks match this filter.')
            console.log(formatNextCursorFooter(sections[0].nextCursor))
            return
        }
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
