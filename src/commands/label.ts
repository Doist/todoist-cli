import type { Label } from '@doist/todoist-api-typescript'
import chalk from 'chalk'
import { Command } from 'commander'
import { getApi } from '../lib/api/core.js'
import { openInBrowser } from '../lib/browser.js'
import {
    formatError,
    formatNextCursorFooter,
    formatPaginatedJson,
    formatPaginatedNdjson,
} from '../lib/output.js'
import { LIMITS, paginate } from '../lib/pagination.js'
import { extractId, isIdRef, looksLikeRawId } from '../lib/refs.js'
import { listTasksForProject, type TaskListOptions } from '../lib/task-list.js'
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

    if (options.json) {
        console.log(
            formatPaginatedJson(
                { results: labels, nextCursor },
                'label',
                options.full,
                options.showUrls,
            ),
        )
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
        return
    }

    if (labels.length === 0) {
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

async function resolveLabelRef(nameOrId: string): Promise<Label> {
    const api = await getApi()
    const { results: labels } = await api.getLabels()

    if (isIdRef(nameOrId)) {
        const id = extractId(nameOrId)
        const label = labels.find((l) => l.id === id)
        if (!label) {
            throw new Error(formatError('LABEL_NOT_FOUND', 'Label not found.'))
        }
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

async function browseLabel(nameOrId: string): Promise<void> {
    const label = await resolveLabelRef(nameOrId)
    await openInBrowser(labelUrl(label.id))
}

interface ViewOptions
    extends Pick<
        TaskListOptions,
        'limit' | 'cursor' | 'all' | 'json' | 'ndjson' | 'full' | 'raw' | 'showUrls'
    > {}

async function viewLabel(nameOrId: string, options: ViewOptions): Promise<void> {
    const label = await resolveLabelRef(nameOrId)
    await listTasksForProject(null, { ...options, label: label.name })
}

export function registerLabelCommand(program: Command): void {
    const label = program.command('label').description('Manage labels')

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

    const viewCmd = label
        .command('view [ref]')
        .description('Show tasks with a label')
        .option('--limit <n>', 'Limit number of results (default: 300)')
        .option('--cursor <cursor>', 'Continue from cursor')
        .option('--all', 'Fetch all results (no limit)')
        .option('--json', 'Output as JSON')
        .option('--ndjson', 'Output as newline-delimited JSON')
        .option('--full', 'Include all fields in JSON output')
        .option('--raw', 'Disable markdown rendering')
        .option('--show-urls', 'Show web app URLs for each task')
        .action((ref, options: ViewOptions) => {
            if (!ref) {
                viewCmd.help()
                return
            }
            return viewLabel(ref, options)
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
