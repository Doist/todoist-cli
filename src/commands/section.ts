import { Command } from 'commander'
import { getApi } from '../lib/api.js'
import { formatPaginatedJson, formatPaginatedNdjson, formatNextCursorFooter, formatError } from '../lib/output.js'
import { paginate, DEFAULT_LIMIT } from '../lib/pagination.js'
import { isIdRef, extractId, requireIdRef } from '../lib/refs.js'
import chalk from 'chalk'

async function resolveProjectId(api: Awaited<ReturnType<typeof getApi>>, nameOrId: string): Promise<string> {
  if (isIdRef(nameOrId)) {
    return extractId(nameOrId)
  }

  const { results: projects } = await api.getProjects()
  const lower = nameOrId.toLowerCase()

  const exact = projects.find((p) => p.name.toLowerCase() === lower)
  if (exact) return exact.id

  const partial = projects.filter((p) => p.name.toLowerCase().includes(lower))
  if (partial.length === 1) return partial[0].id
  if (partial.length > 1) {
    throw new Error(
      formatError(
        'AMBIGUOUS_PROJECT',
        `Multiple projects match "${nameOrId}":`,
        partial.slice(0, 5).map((p) => `"${p.name}" (id:${p.id})`)
      )
    )
  }

  throw new Error(formatError('PROJECT_NOT_FOUND', `Project "${nameOrId}" not found.`))
}

interface ListOptions {
  limit?: string
  all?: boolean
  json?: boolean
  ndjson?: boolean
  full?: boolean
}

async function listSections(projectRef: string, options: ListOptions): Promise<void> {
  const api = await getApi()
  const projectId = await resolveProjectId(api, projectRef)

  const targetLimit = options.all
    ? Number.MAX_SAFE_INTEGER
    : options.limit
      ? parseInt(options.limit, 10)
      : DEFAULT_LIMIT

  const { results: sections, nextCursor } = await paginate(
    (cursor, limit) => api.getSections({ projectId, cursor: cursor ?? undefined, limit }),
    { limit: targetLimit }
  )

  if (options.json) {
    console.log(formatPaginatedJson({ results: sections, nextCursor }, 'section', options.full))
    return
  }

  if (options.ndjson) {
    console.log(formatPaginatedNdjson({ results: sections, nextCursor }, 'section', options.full))
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

async function deleteSection(sectionId: string, options: { yes?: boolean }): Promise<void> {
  if (!options.yes) {
    throw new Error(formatError('CONFIRMATION_REQUIRED', 'Use --yes to confirm deletion.'))
  }

  const api = await getApi()
  const id = requireIdRef(sectionId, 'section')
  await api.deleteSection(id)
  console.log(`Deleted section ${id}`)
}

export function registerSectionCommand(program: Command): void {
  const section = program.command('section').description('Manage project sections')

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
