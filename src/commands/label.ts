import type { Label } from '@doist/todoist-api-typescript'
import chalk from 'chalk'
import { Command } from 'commander'
import { getApi, type Project } from '../lib/api/core.js'
import { openInBrowser } from '../lib/browser.js'
import { CollaboratorCache, formatAssignee } from '../lib/collaborators.js'
import type { PaginatedViewOptions } from '../lib/options.js'
import {
    formatError,
    formatNextCursorFooter,
    formatPaginatedJson,
    formatPaginatedNdjson,
    formatTaskRow,
} from '../lib/output.js'
import { LIMITS, paginate } from '../lib/pagination.js'
import { isIdRef, lenientIdRef, looksLikeRawId, parseTodoistUrl } from '../lib/refs.js'
import { labelUrl } from '../lib/urls.js'

interface ListOptions {
    limit?: string
    all?: boolean
    json?: boolean
    ndjson?: boolean
    full?: boolean
    showUrls?: boolean
}

async function listLabels(options: ListOptions): Promise<void> {
    const api = await getApi()

    const targetLimit = options.all
        ? Number.MAX_SAFE_INTEGER
        : options.limit
          ? parseInt(options.limit, 10)
          : LIMITS.labels

    const { results: labels, nextCursor } = await paginate(
        (cursor, limit) => api.getLabels({ cursor: cursor ?? undefined, limit }),
        { limit: targetLimit },
    )

    // Fetch shared-only labels (not in personal labels)
    const { results: sharedLabels } = await paginate(
        (cursor, limit) =>
            api.getSharedLabels({
                omitPersonal: true,
                cursor: cursor ?? undefined,
                limit,
            }),
        { limit: targetLimit },
    )

    if (options.json) {
        const base = JSON.parse(
            formatPaginatedJson(
                { results: labels, nextCursor },
                'label',
                options.full,
                options.showUrls,
            ),
        )
        base.sharedLabels = sharedLabels
        console.log(JSON.stringify(base, null, 2))
        return
    }

    if (options.ndjson) {
        console.log(
            formatPaginatedNdjson(
                { results: labels, nextCursor },
                'label',
                options.full,
                options.showUrls,
            ),
        )
        for (const name of sharedLabels) {
            console.log(JSON.stringify({ _type: 'sharedLabel', name }))
        }
        return
    }

    if (labels.length === 0 && sharedLabels.length === 0) {
        console.log('No labels found.')
        return
    }

    for (const label of labels) {
        const id = chalk.dim(label.id)
        const name = label.isFavorite ? chalk.yellow(`@${label.name}`) : `@${label.name}`
        console.log(`${id}  ${name}`)
        if (options.showUrls) {
            console.log(`  ${chalk.dim(labelUrl(label.id))}`)
        }
    }

    for (const name of sharedLabels) {
        console.log(`${chalk.dim('(shared)')}  @${name}`)
    }

    console.log(formatNextCursorFooter(nextCursor))
}

interface CreateOptions {
    name: string
    color?: string
    favorite?: boolean
}

async function createLabel(options: CreateOptions): Promise<void> {
    const api = await getApi()

    const label = await api.addLabel({
        name: options.name,
        color: options.color,
        isFavorite: options.favorite,
    })

    console.log(`Created: @${label.name}`)
    console.log(chalk.dim(`ID: ${label.id}`))
}

async function deleteLabel(nameOrId: string, options: { yes?: boolean }): Promise<void> {
    const label = await resolveLabelRef(nameOrId)

    if (!options.yes) {
        console.log(`Would delete: @${label.name}`)
        console.log('Use --yes to confirm.')
        return
    }

    const api = await getApi()
    await api.deleteLabel(label.id)
    console.log(`Deleted: @${label.name}`)
}

interface UpdateLabelOptions {
    name?: string
    color?: string
    favorite?: boolean
}

async function updateLabel(nameOrId: string, options: UpdateLabelOptions): Promise<void> {
    const label = await resolveLabelRef(nameOrId)

    const args: {
        name?: string
        color?: string
        isFavorite?: boolean
    } = {}
    if (options.name) args.name = options.name
    if (options.color) args.color = options.color
    if (options.favorite === true) args.isFavorite = true
    if (options.favorite === false) args.isFavorite = false

    if (Object.keys(args).length === 0) {
        throw new Error(formatError('NO_CHANGES', 'No changes specified.'))
    }

    const api = await getApi()
    const updated = await api.updateLabel(label.id, args)
    console.log(`Updated: @${label.name}${options.name ? ` → @${updated.name}` : ''}`)
}

// Resolves a label ref to a personal Label object. Used by delete/update/browse
// which require an ID. Does NOT fall back to shared labels — use
// resolveLabelNameForView() for view which only needs a name.
async function resolveLabelRef(nameOrId: string): Promise<Label> {
    const api = await getApi()
    const { results: labels } = await api.getLabels()

    if (parseTodoistUrl(nameOrId) || isIdRef(nameOrId)) {
        const id = lenientIdRef(nameOrId, 'label')
        const label = labels.find((l) => l.id === id)
        if (!label) throw new Error(formatError('LABEL_NOT_FOUND', 'Label not found.'))
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

    throw new Error(formatError('LABEL_NOT_FOUND', `Label "${nameOrId}" not found.`))
}

interface ResolvedLabelForView {
    name: string
    label: Label | null // null for shared-only labels
}

// Resolves a label ref for viewing. Falls back to shared labels when no
// personal label matches, since view only needs a name for the filter query.
async function resolveLabelNameForView(nameOrId: string): Promise<ResolvedLabelForView> {
    const api = await getApi()
    const { results: labels } = await api.getLabels()

    // URL or id: ref → must be a personal label (shared labels have no IDs)
    if (parseTodoistUrl(nameOrId) || isIdRef(nameOrId)) {
        const id = lenientIdRef(nameOrId, 'label')
        const label = labels.find((l) => l.id === id)
        if (!label) throw new Error(formatError('LABEL_NOT_FOUND', 'Label not found.'))
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

    throw new Error(formatError('LABEL_NOT_FOUND', `Label "${nameOrId}" not found.`))
}

export async function viewLabel(nameOrId: string, options: PaginatedViewOptions): Promise<void> {
    const resolved = await resolveLabelNameForView(nameOrId)
    const api = await getApi()

    const targetLimit = options.all
        ? Number.MAX_SAFE_INTEGER
        : options.limit
          ? parseInt(options.limit, 10)
          : LIMITS.tasks

    const { results: tasks, nextCursor } = await paginate(
        (cursor, limit) =>
            api.getTasksByFilter({
                query: `@${resolved.name}`,
                cursor: cursor ?? undefined,
                limit,
            }),
        { limit: targetLimit },
    )

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

    console.log(chalk.bold(`@${resolved.name}`))
    if (resolved.label) {
        console.log(chalk.dim(`ID:    ${resolved.label.id}`))
        console.log(chalk.dim(`Color: ${resolved.label.color}`))
        console.log(chalk.dim(`URL:   ${labelUrl(resolved.label.id)}`))
        if (resolved.label.isFavorite) console.log(chalk.yellow('★ Favorite'))
    } else {
        console.log(chalk.dim('Type:  shared label'))
    }
    console.log('')

    if (tasks.length === 0) {
        console.log('No tasks with this label.')
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

async function browseLabel(nameOrId: string): Promise<void> {
    const label = await resolveLabelRef(nameOrId)
    await openInBrowser(labelUrl(label.id))
}

export function registerLabelCommand(program: Command): void {
    const label = program.command('label').description('Manage labels')

    const viewCmd = label
        .command('view [ref]', { isDefault: true })
        .description('View label details and tasks')
        .option('--limit <n>', 'Limit number of results (default: 300)')
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
            return viewLabel(ref, options)
        })

    label
        .command('list')
        .description('List all labels')
        .option('--limit <n>', 'Limit number of results (default: 300)')
        .option('--all', 'Fetch all results (no limit)')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .option('--show-urls', 'Show web app URLs for each label')
        .action(listLabels)

    const createCmd = label
        .command('create')
        .description('Create a label')
        .option('--name <name>', 'Label name (required)')
        .option('--color <color>', 'Label color')
        .option('--favorite', 'Mark as favorite')
        .action((options) => {
            if (!options.name) {
                createCmd.help()
                return
            }
            return createLabel(options)
        })

    const deleteCmd = label
        .command('delete [name]')
        .description('Delete a label')
        .option('--yes', 'Confirm deletion')
        .action((name, options) => {
            if (!name) {
                deleteCmd.help()
                return
            }
            return deleteLabel(name, options)
        })

    const updateCmd = label
        .command('update [ref]')
        .description('Update a label')
        .option('--name <name>', 'New name')
        .option('--color <color>', 'New color')
        .option('--favorite', 'Mark as favorite')
        .option('--no-favorite', 'Remove from favorites')
        .action((ref, options) => {
            if (!ref) {
                updateCmd.help()
                return
            }
            return updateLabel(ref, options)
        })

    const browseCmd = label
        .command('browse [ref]')
        .description('Open label in browser')
        .action((ref) => {
            if (!ref) {
                browseCmd.help()
                return
            }
            return browseLabel(ref)
        })
}
