import { Command } from 'commander'
import { getApi } from '../lib/api.js'
import {
  formatPaginatedJson,
  formatPaginatedNdjson,
  formatNextCursorFooter,
  formatError,
} from '../lib/output.js'
import { paginate, LIMITS } from '../lib/pagination.js'
import { isIdRef, extractId } from '../lib/refs.js'
import chalk from 'chalk'

interface ListOptions {
  limit?: string
  all?: boolean
  json?: boolean
  ndjson?: boolean
  full?: boolean
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
    { limit: targetLimit }
  )

  if (options.json) {
    console.log(
      formatPaginatedJson(
        { results: labels, nextCursor },
        'label',
        options.full
      )
    )
    return
  }

  if (options.ndjson) {
    console.log(
      formatPaginatedNdjson(
        { results: labels, nextCursor },
        'label',
        options.full
      )
    )
    return
  }

  if (labels.length === 0) {
    console.log('No labels found.')
    return
  }

  for (const label of labels) {
    const id = chalk.dim(label.id)
    const name = label.isFavorite
      ? chalk.yellow(`@${label.name}`)
      : `@${label.name}`
    console.log(`${id}  ${name}`)
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

async function deleteLabel(
  nameOrId: string,
  options: { yes?: boolean }
): Promise<void> {
  const api = await getApi()
  const { results: labels } = await api.getLabels()

  let labelId: string | undefined
  let labelName = nameOrId

  if (isIdRef(nameOrId)) {
    labelId = extractId(nameOrId)
    const label = labels.find((l) => l.id === labelId)
    if (label) labelName = label.name
  } else {
    const name = nameOrId.startsWith('@') ? nameOrId.slice(1) : nameOrId
    const label = labels.find(
      (l) => l.name.toLowerCase() === name.toLowerCase()
    )
    if (!label) {
      throw new Error(
        formatError('LABEL_NOT_FOUND', `Label "${nameOrId}" not found.`)
      )
    }
    labelId = label.id
    labelName = label.name
  }

  if (!options.yes) {
    console.log(`Would delete: @${labelName}`)
    console.log('Use --yes to confirm.')
    return
  }

  await api.deleteLabel(labelId)
  console.log(`Deleted: @${labelName}`)
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
    .action(listLabels)

  label
    .command('create')
    .description('Create a label')
    .requiredOption('--name <name>', 'Label name')
    .option('--color <color>', 'Label color')
    .option('--favorite', 'Mark as favorite')
    .action(createLabel)

  label
    .command('delete <name>')
    .description('Delete a label')
    .option('--yes', 'Confirm deletion')
    .action(deleteLabel)
}
