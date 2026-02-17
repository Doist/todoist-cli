import chalk from 'chalk'
import { Command } from 'commander'
import { getApi, type Project } from '../lib/api/core.js'
import {
    addFilter,
    deleteFilter,
    type Filter,
    fetchFilters,
    updateFilter,
} from '../lib/api/filters.js'
import { openInBrowser } from '../lib/browser.js'
import { CollaboratorCache, formatAssignee } from '../lib/collaborators.js'
import {
    formatError,
    formatNextCursorFooter,
    formatPaginatedJson,
    formatPaginatedNdjson,
    formatTaskRow,
} from '../lib/output.js'
import { LIMITS, paginate } from '../lib/pagination.js'
import { isIdRef, lenientIdRef, looksLikeRawId, parseTodoistUrl } from '../lib/refs.js'
import { filterUrl } from '../lib/urls.js'

interface ListOptions {
    json?: boolean
    ndjson?: boolean
    full?: boolean
    showUrls?: boolean
}

async function listFilters(options: ListOptions): Promise<void> {
    const filters = await fetchFilters()

    if (options.json) {
        console.log(
            formatPaginatedJson(
                { results: filters, nextCursor: null },
                'filter',
                options.full,
                options.showUrls,
            ),
        )
        return
    }

    if (options.ndjson) {
        console.log(
            formatPaginatedNdjson(
                { results: filters, nextCursor: null },
                'filter',
                options.full,
                options.showUrls,
            ),
        )
        return
    }

    if (filters.length === 0) {
        console.log('No filters found.')
        return
    }

    for (const filter of filters) {
        const id = chalk.dim(`id:${filter.id}`)
        const name = filter.isFavorite ? chalk.yellow(filter.name) : filter.name
        const query = chalk.dim(`"${filter.query}"`)
        console.log(`${id}  ${name}  ${query}`)
        if (options.showUrls) {
            console.log(`  ${chalk.dim(filterUrl(filter.id))}`)
        }
    }
}

interface CreateOptions {
    name: string
    query: string
    color?: string
    favorite?: boolean
}

async function createFilter(options: CreateOptions): Promise<void> {
    const filter = await addFilter({
        name: options.name,
        query: options.query,
        color: options.color,
        isFavorite: options.favorite,
    })

    console.log(`Created: ${filter.name}`)
    console.log(chalk.dim(`ID: id:${filter.id}`))
    console.log(chalk.dim(`Query: ${filter.query}`))
}

async function resolveFilterRef(nameOrId: string): Promise<Filter> {
    const filters = await fetchFilters()

    if (parseTodoistUrl(nameOrId) || isIdRef(nameOrId)) {
        const id = lenientIdRef(nameOrId, 'filter')
        const filter = filters.find((f) => f.id === id)
        if (!filter) throw new Error(formatError('FILTER_NOT_FOUND', 'Filter not found.'))
        return filter
    }

    const lower = nameOrId.toLowerCase()
    const exact = filters.find((f) => f.name.toLowerCase() === lower)
    if (exact) return exact

    const partial = filters.filter((f) => f.name.toLowerCase().includes(lower))
    if (partial.length === 1) return partial[0]
    if (partial.length > 1) {
        throw new Error(
            formatError('AMBIGUOUS_FILTER', `Multiple filters match "${nameOrId}".`, [
                'Use id:xxx to specify exactly',
                ...partial.slice(0, 5).map((f) => `${f.name} (id:${f.id})`),
            ]),
        )
    }

    if (looksLikeRawId(nameOrId)) {
        const byId = filters.find((f) => f.id === nameOrId)
        if (byId) return byId
    }

    throw new Error(formatError('FILTER_NOT_FOUND', `Filter "${nameOrId}" not found.`))
}

async function deleteFilterCmd(nameOrId: string, options: { yes?: boolean }): Promise<void> {
    const filter = await resolveFilterRef(nameOrId)

    if (!options.yes) {
        console.log(`Would delete: ${filter.name}`)
        console.log(chalk.dim(`Query: ${filter.query}`))
        console.log('Use --yes to confirm.')
        return
    }

    await deleteFilter(filter.id)
    console.log(`Deleted: ${filter.name}`)
}

interface UpdateOptions {
    name?: string
    query?: string
    color?: string
    favorite?: boolean
}

async function updateFilterCmd(nameOrId: string, options: UpdateOptions): Promise<void> {
    const filter = await resolveFilterRef(nameOrId)

    const args: {
        name?: string
        query?: string
        color?: string
        isFavorite?: boolean
    } = {}
    if (options.name) args.name = options.name
    if (options.query) args.query = options.query
    if (options.color) args.color = options.color
    if (options.favorite !== undefined) args.isFavorite = options.favorite

    if (Object.keys(args).length === 0) {
        throw new Error(formatError('NO_CHANGES', 'No changes specified.'))
    }

    await updateFilter(filter.id, args)
    console.log(`Updated: ${filter.name}${options.name ? ` -> ${options.name}` : ''}`)
}

interface ShowOptions {
    limit?: string
    cursor?: string
    all?: boolean
    json?: boolean
    ndjson?: boolean
    full?: boolean
    showUrls?: boolean
}

export async function showFilter(nameOrId: string, options: ShowOptions): Promise<void> {
    const filter = await resolveFilterRef(nameOrId)
    const api = await getApi()

    const targetLimit = options.all
        ? Number.MAX_SAFE_INTEGER
        : options.limit
          ? parseInt(options.limit, 10)
          : LIMITS.tasks

    let tasks: Awaited<ReturnType<typeof api.getTasksByFilter>>['results']
    let nextCursor: string | null

    try {
        const result = await paginate(
            (cursor, limit) =>
                api.getTasksByFilter({
                    query: filter.query,
                    cursor: cursor ?? undefined,
                    limit,
                }),
            { limit: targetLimit, startCursor: options.cursor },
        )
        tasks = result.results
        nextCursor = result.nextCursor
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (message.includes('400')) {
            throw new Error(
                formatError('INVALID_FILTER_QUERY', `Filter query "${filter.query}" is invalid.`, [
                    'Check the Todoist filter syntax',
                ]),
            )
        }
        throw err
    }

    if (options.json) {
        console.log(
            formatPaginatedJson(
                { results: tasks, nextCursor },
                'task',
                options.full,
                options.showUrls,
            ),
        )
        return
    }

    if (options.ndjson) {
        console.log(
            formatPaginatedNdjson(
                { results: tasks, nextCursor },
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
    console.log('')

    if (tasks.length === 0) {
        console.log('No tasks match this filter.')
        console.log(formatNextCursorFooter(nextCursor))
        return
    }

    const { results: projects } = await api.getProjects()
    const projectMap = new Map<string, Project>()
    for (const p of projects) {
        projectMap.set(p.id, p)
    }

    const collaboratorCache = new CollaboratorCache()
    await collaboratorCache.preload(api, tasks, projectMap)

    for (const task of tasks) {
        const assignee = formatAssignee({
            userId: task.responsibleUid,
            projectId: task.projectId,
            projects: projectMap,
            cache: collaboratorCache,
        })
        console.log(
            formatTaskRow({
                task,
                projectName: projectMap.get(task.projectId)?.name,
                assignee: assignee ?? undefined,
                showUrl: options.showUrls,
            }),
        )
        console.log('')
    }
    console.log(formatNextCursorFooter(nextCursor))
}

async function browseFilter(nameOrId: string): Promise<void> {
    const filter = await resolveFilterRef(nameOrId)
    await openInBrowser(filterUrl(filter.id))
}

export function registerFilterCommand(program: Command): void {
    const filter = program.command('filter').description('Manage filters')

    filter
        .command('list')
        .description('List all filters')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .option('--show-urls', 'Show web app URLs for each filter')
        .action(listFilters)

    const createCmd = filter
        .command('create')
        .description('Create a filter')
        .option('--name <name>', 'Filter name (required)')
        .option('--query <query>', 'Filter query (required, e.g., "today | overdue")')
        .option('--color <color>', 'Filter color')
        .option('--favorite', 'Mark as favorite')
        .action((options) => {
            if (!options.name || !options.query) {
                createCmd.help()
                return
            }
            return createFilter(options)
        })

    const deleteCmd = filter
        .command('delete [ref]')
        .description('Delete a filter')
        .option('--yes', 'Confirm deletion')
        .action((ref, options) => {
            if (!ref) {
                deleteCmd.help()
                return
            }
            return deleteFilterCmd(ref, options)
        })

    const updateCmd = filter
        .command('update [ref]')
        .description('Update a filter')
        .option('--name <name>', 'New name')
        .option('--query <query>', 'New query')
        .option('--color <color>', 'New color')
        .option('--favorite', 'Mark as favorite')
        .option('--no-favorite', 'Remove from favorites')
        .action((ref, options) => {
            if (!ref) {
                updateCmd.help()
                return
            }
            return updateFilterCmd(ref, options)
        })

    const viewCmd = filter
        .command('view [ref]', { isDefault: true })
        .alias('show')
        .description('Show tasks matching a filter')
        .option('--limit <n>', 'Limit number of results (default: 300)')
        .option('--cursor <cursor>', 'Continue from cursor')
        .option('--all', 'Fetch all results (no limit)')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .option('--show-urls', 'Show web app URLs for each task')
        .action((ref, options) => {
            if (!ref) {
                viewCmd.help()
                return
            }
            return showFilter(ref, options)
        })

    const browseCmd = filter
        .command('browse [ref]')
        .description('Open filter in browser')
        .action((ref) => {
            if (!ref) {
                browseCmd.help()
                return
            }
            return browseFilter(ref)
        })
}
