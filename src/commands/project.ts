import { Command } from 'commander'
import { getApi } from '../lib/api.js'
import { formatPaginatedJson, formatPaginatedNdjson, formatNextCursorFooter, formatError } from '../lib/output.js'
import { paginate, DEFAULT_LIMIT } from '../lib/pagination.js'
import { isIdRef, extractId } from '../lib/refs.js'
import chalk from 'chalk'

interface ListOptions {
  limit?: string
  cursor?: string
  all?: boolean
  json?: boolean
  ndjson?: boolean
  full?: boolean
}

async function listProjects(options: ListOptions): Promise<void> {
  const api = await getApi()

  const targetLimit = options.all
    ? Number.MAX_SAFE_INTEGER
    : options.limit
      ? parseInt(options.limit, 10)
      : 50

  const { results: projects, nextCursor } = await paginate(
    (cursor, limit) => api.getProjects({ cursor: cursor ?? undefined, limit }),
    { limit: targetLimit, startCursor: options.cursor }
  )

  if (options.json) {
    console.log(formatPaginatedJson({ results: projects, nextCursor }, 'project', options.full))
    return
  }

  if (options.ndjson) {
    console.log(formatPaginatedNdjson({ results: projects, nextCursor }, 'project', options.full))
    return
  }

  for (const project of projects) {
    const id = chalk.dim(project.id)
    const name = project.isFavorite ? chalk.yellow(project.name) : project.name
    console.log(`${id}  ${name}`)
  }
  console.log(formatNextCursorFooter(nextCursor))
}

async function resolveProjectRef(api: Awaited<ReturnType<typeof getApi>>, ref: string) {
  if (isIdRef(ref)) {
    return api.getProject(extractId(ref))
  }

  const { results: projects } = await api.getProjects()
  const lower = ref.toLowerCase()

  const exact = projects.find((p) => p.name.toLowerCase() === lower)
  if (exact) return exact

  const partial = projects.filter((p) => p.name.toLowerCase().includes(lower))
  if (partial.length === 1) return partial[0]
  if (partial.length > 1) {
    throw new Error(
      formatError(
        'AMBIGUOUS_PROJECT',
        `Multiple projects match "${ref}":`,
        partial.slice(0, 5).map((p) => `"${p.name}" (id:${p.id})`)
      )
    )
  }

  throw new Error(
    formatError('PROJECT_NOT_FOUND', `Project "${ref}" not found.`)
  )
}

async function viewProject(ref: string): Promise<void> {
  const api = await getApi()
  const project = await resolveProjectRef(api, ref)

  console.log(chalk.bold(project.name))
  console.log('')
  console.log(`ID:       ${project.id}`)
  console.log(`Color:    ${project.color}`)
  console.log(`Favorite: ${project.isFavorite ? 'Yes' : 'No'}`)
  console.log(`URL:      ${project.url}`)

  const { results: tasks } = await api.getTasks({ projectId: project.id })

  if (tasks.length > 0) {
    console.log('')
    console.log(chalk.dim(`--- Tasks (${tasks.length}) ---`))
    for (const task of tasks) {
      const priority = chalk.dim(`p${5 - task.priority}`)
      console.log(`  ${priority}  ${task.content}`)
    }
  }
}

export function registerProjectCommand(program: Command): void {
  const project = program.command('project').description('Manage projects')

  project
    .command('list')
    .description('List all projects')
    .option('--limit <n>', 'Limit number of results (default: 50)')
    .option('--cursor <cursor>', 'Continue from cursor')
    .option('--all', 'Fetch all results (no limit)')
    .option('--json', 'Output as JSON')
    .option('--ndjson', 'Output as newline-delimited JSON')
    .option('--full', 'Include all fields in JSON output')
    .action(listProjects)

  project
    .command('view <ref>')
    .description('View project details')
    .action(viewProject)
}
