import { Command } from 'commander'
import { getApi } from '../lib/api.js'
import { formatJson, formatError } from '../lib/output.js'
import chalk from 'chalk'

interface ListOptions {
  json?: boolean
}

async function listProjects(options: ListOptions): Promise<void> {
  const api = await getApi()
  const { results: projects } = await api.getProjects()

  if (options.json) {
    console.log(formatJson(projects))
    return
  }

  for (const project of projects) {
    const id = chalk.dim(project.id)
    const name = project.isFavorite ? chalk.yellow(project.name) : project.name
    console.log(`${id}  ${name}`)
  }
}

async function resolveProjectRef(api: Awaited<ReturnType<typeof getApi>>, ref: string) {
  if (ref.startsWith('id:')) {
    const id = ref.slice(3)
    return api.getProject(id)
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
    .option('--json', 'Output as JSON')
    .action(listProjects)

  project
    .command('view <ref>')
    .description('View project details')
    .action(viewProject)
}
