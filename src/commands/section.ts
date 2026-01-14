import { Command } from 'commander'
import { getApi } from '../lib/api.js'
import {
  formatPaginatedJson,
  formatPaginatedNdjson,
  formatNextCursorFooter,
  formatError,
} from '../lib/output.js'
import { sectionUrl } from '../lib/urls.js'
import { paginate, LIMITS } from '../lib/pagination.js'
import { requireIdRef, resolveProjectId } from '../lib/refs.js'
import chalk from 'chalk'

interface ListOptions {
  limit?: string
  all?: boolean
  json?: boolean
  ndjson?: boolean
  full?: boolean
  showUrls?: boolean
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
        options.full,
        options.showUrls
      )
    )
    return
  }

  if (options.ndjson) {
    console.log(
      formatPaginatedNdjson(
        { results: sections, nextCursor },
        'section',
        options.full,
        options.showUrls
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
    if (options.showUrls) {
      console.log(`  ${chalk.dim(sectionUrl(section.id))}`)
    }
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

  const { results: tasks } = await api.getTasks({ sectionId: id })
  if (tasks.length > 0) {
    throw new Error(
      formatError(
        'HAS_TASKS',
        `Cannot delete section: ${tasks.length} uncompleted task${tasks.length === 1 ? '' : 's'} remain.`
      )
    )
  }

  if (!options.yes) {
    console.log(`Would delete section: ${section.name}`)
    console.log('Use --yes to confirm.')
    return
  }

  await api.deleteSection(id)
  console.log(`Deleted section: ${section.name}`)
}

async function updateSection(
  sectionId: string,
  options: { name: string }
): Promise<void> {
  const api = await getApi()
  const id = requireIdRef(sectionId, 'section')
  const section = await api.getSection(id)

  const updated = await api.updateSection(id, { name: options.name })
  console.log(`Updated: ${section.name} → ${updated.name}`)
}

export function registerSectionCommand(program: Command): void {
  const section = program
    .command('section')
    .description('Manage project sections')

  const listCmd = section
    .command('list [project]')
    .description('List sections in a project')
    .option('--limit <n>', 'Limit number of results (default: 300)')
    .option('--all', 'Fetch all results (no limit)')
    .option('--json', 'Output as JSON')
    .option('--ndjson', 'Output as newline-delimited JSON')
    .option('--full', 'Include all fields in JSON output')
    .option('--show-urls', 'Show web app URLs for each section')
    .action((project, options) => {
      if (!project) {
        listCmd.help()
        return
      }
      return listSections(project, options)
    })

  const createCmd = section
    .command('create')
    .description('Create a section')
    .option('--name <name>', 'Section name (required)')
    .option('--project <name>', 'Project name or id:xxx (required)')
    .action((options) => {
      if (!options.name || !options.project) {
        createCmd.help()
        return
      }
      return createSection(options)
    })

  const deleteCmd = section
    .command('delete [id]')
    .description('Delete a section')
    .option('--yes', 'Confirm deletion')
    .action((id, options) => {
      if (!id) {
        deleteCmd.help()
        return
      }
      return deleteSection(id, options)
    })

  const updateCmd = section
    .command('update [id]')
    .description('Update a section')
    .option('--name <name>', 'New section name (required)')
    .action((id, options) => {
      if (!id || !options.name) {
        updateCmd.help()
        return
      }
      return updateSection(id, options)
    })
}
