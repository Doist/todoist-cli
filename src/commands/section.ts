import { Command } from 'commander'
import { getApi } from '../lib/api.js'
import {
  formatPaginatedJson,
  formatPaginatedNdjson,
  formatNextCursorFooter,
  formatError,
} from '../lib/output.js'
import { paginate, LIMITS } from '../lib/pagination.js'
import { requireIdRef, resolveProjectId } from '../lib/refs.js'
import chalk from 'chalk'

interface ListOptions {
  limit?: string
  all?: boolean
  json?: boolean
  ndjson?: boolean
  full?: boolean
}

async function listSections(
  projectRef: string,
  options: ListOptions
): Promise<void> {
  const api = await getApi()
  const projectId = await resolveProjectId(api, projectRef)

  const targetLimit = options.all
    ? Number.MAX_SAFE_INTEGER
    : options.limit
      ? parseInt(options.limit, 10)
      : LIMITS.sections

  const { results: sections, nextCursor } = await paginate(
    (cursor, limit) =>
      api.getSections({ projectId, cursor: cursor ?? undefined, limit }),
    { limit: targetLimit }
  )

  if (options.json) {
    console.log(
      formatPaginatedJson(
        { results: sections, nextCursor },
        'section',
        options.full
      )
    )
    return
  }

  if (options.ndjson) {
    console.log(
      formatPaginatedNdjson(
        { results: sections, nextCursor },
        'section',
        options.full
      )
    )
    return
  }

  if (sections.length === 0) {
    console.log('No sections.')
    return
  }

  for (const section of sections) {
    const id = chalk.dim(section.id)
    console.log(`${id}  ${section.name}`)
  }
  console.log(formatNextCursorFooter(nextCursor))
}

interface CreateOptions {
  name: string
  project: string
}

async function createSection(options: CreateOptions): Promise<void> {
  const api = await getApi()
  const projectId = await resolveProjectId(api, options.project)

  const section = await api.addSection({
    name: options.name,
    projectId,
  })

  console.log(`Created: ${section.name}`)
  console.log(chalk.dim(`ID: ${section.id}`))
}

async function deleteSection(
  sectionId: string,
  options: { yes?: boolean }
): Promise<void> {
  const api = await getApi()
  const id = requireIdRef(sectionId, 'section')
  const section = await api.getSection(id)

  if (!options.yes) {
    console.log(`Would delete section: ${section.name}`)
    console.log('Use --yes to confirm.')
    return
  }

  await api.deleteSection(id)
  console.log(`Deleted section: ${section.name}`)
}

export function registerSectionCommand(program: Command): void {
  const section = program
    .command('section')
    .description('Manage project sections')

  section
    .command('list <project>')
    .description('List sections in a project')
    .option('--limit <n>', 'Limit number of results (default: 300)')
    .option('--all', 'Fetch all results (no limit)')
    .option('--json', 'Output as JSON')
    .option('--ndjson', 'Output as newline-delimited JSON')
    .option('--full', 'Include all fields in JSON output')
    .action(listSections)

  section
    .command('create')
    .description('Create a section')
    .requiredOption('--name <name>', 'Section name')
    .requiredOption('--project <name>', 'Project name or id:xxx')
    .action(createSection)

  section
    .command('delete <id>')
    .description('Delete a section')
    .option('--yes', 'Confirm deletion')
    .action(deleteSection)
}
