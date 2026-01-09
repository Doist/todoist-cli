import { Command } from 'commander'
import { getApi, type Project } from '../lib/api.js'
import { formatTaskView, formatError } from '../lib/output.js'
import { isIdRef, extractId, requireIdRef } from '../lib/refs.js'
import { listTasksForProject, parsePriority, type TaskListOptions } from '../lib/task-list.js'
import type { Task } from '@doist/todoist-api-typescript'

interface ListOptions extends TaskListOptions {
  project?: string
}

interface ViewOptions {
  full?: boolean
}

async function resolveProjectId(api: Awaited<ReturnType<typeof getApi>>, nameOrId: string): Promise<string | null> {
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

  throw new Error(
    formatError('PROJECT_NOT_FOUND', `Project "${nameOrId}" not found.`)
  )
}

async function listTasks(options: ListOptions): Promise<void> {
  let projectId: string | null = null

  if (options.project) {
    const api = await getApi()
    projectId = await resolveProjectId(api, options.project)
  }

  await listTasksForProject(projectId, options)
}

async function resolveTaskRef(api: Awaited<ReturnType<typeof getApi>>, ref: string): Promise<Task> {
  if (isIdRef(ref)) {
    return api.getTask(extractId(ref))
  }

  const { results: tasks } = await api.getTasks()
  const lower = ref.toLowerCase()

  const exact = tasks.find((t) => t.content.toLowerCase() === lower)
  if (exact) return exact

  const partial = tasks.filter((t) => t.content.toLowerCase().includes(lower))
  if (partial.length === 1) return partial[0]
  if (partial.length > 1) {
    throw new Error(
      formatError(
        'AMBIGUOUS_TASK',
        `Multiple tasks match "${ref}":`,
        partial.slice(0, 5).map((t) => `"${t.content}" (id:${t.id})`)
      )
    )
  }

  throw new Error(
    formatError('TASK_NOT_FOUND', `Task "${ref}" not found.`)
  )
}

async function viewTask(ref: string, options: ViewOptions): Promise<void> {
  const api = await getApi()
  const task = await resolveTaskRef(api, ref)

  const { results: projects } = await api.getProjects()
  const project = projects.find((p) => p.id === task.projectId)

  console.log(formatTaskView(task, project, options.full))
}

async function completeTask(ref: string): Promise<void> {
  const api = await getApi()
  const task = await resolveTaskRef(api, ref)

  if (task.checked) {
    console.log('Task already completed.')
    return
  }

  await api.closeTask(task.id)
  console.log(`Completed: ${task.content}`)
}

async function deleteTask(ref: string, options: { yes?: boolean }): Promise<void> {
  if (!options.yes) {
    throw new Error(
      formatError('CONFIRMATION_REQUIRED', 'Use --yes to confirm deletion.')
    )
  }

  const api = await getApi()
  const task = await resolveTaskRef(api, ref)
  await api.deleteTask(task.id)
  console.log(`Deleted: ${task.content}`)
}

interface AddOptions {
  content: string
  due?: string
  priority?: string
  project?: string
  section?: string
  labels?: string
  parent?: string
  description?: string
}

async function addTask(options: AddOptions): Promise<void> {
  const api = await getApi()

  const args: Parameters<typeof api.addTask>[0] = {
    content: options.content,
  }

  if (options.due) {
    args.dueString = options.due
  }

  if (options.priority) {
    args.priority = parsePriority(options.priority)
  }

  if (options.project) {
    const projectId = await resolveProjectId(api, options.project)
    if (projectId) args.projectId = projectId
  }

  if (options.section) {
    args.sectionId = requireIdRef(options.section, 'section')
  }

  if (options.labels) {
    args.labels = options.labels.split(',').map((l) => l.trim())
  }

  if (options.parent) {
    args.parentId = requireIdRef(options.parent, 'parent task')
  }

  if (options.description) {
    args.description = options.description
  }

  const task = await api.addTask(args)
  console.log(`Created: ${task.content}`)
  if (task.due) console.log(`Due: ${task.due.string || task.due.date}`)
  console.log(`ID: ${task.id}`)
}

interface UpdateOptions {
  content?: string
  due?: string
  priority?: string
  labels?: string
  description?: string
}

async function updateTask(ref: string, options: UpdateOptions): Promise<void> {
  const api = await getApi()
  const task = await resolveTaskRef(api, ref)

  const args: Parameters<typeof api.updateTask>[1] = {}

  if (options.content) args.content = options.content
  if (options.due) args.dueString = options.due
  if (options.priority) args.priority = parsePriority(options.priority)
  if (options.labels) args.labels = options.labels.split(',').map((l) => l.trim())
  if (options.description) args.description = options.description

  const updated = await api.updateTask(task.id, args)
  console.log(`Updated: ${updated.content}`)
}

export function registerTaskCommand(program: Command): void {
  const task = program.command('task').description('Manage tasks')

  task
    .command('list')
    .description('List tasks')
    .option('--project <name>', 'Filter by project name or id:xxx')
    .option('--priority <p1-p4>', 'Filter by priority')
    .option('--due <date>', 'Filter by due date (today, overdue, or YYYY-MM-DD)')
    .option('--filter <query>', 'Raw Todoist filter query')
    .option('--limit <n>', 'Limit number of results (default: 300)')
    .option('--cursor <cursor>', 'Continue from cursor')
    .option('--all', 'Fetch all results (no limit)')
    .option('--json', 'Output as JSON')
    .option('--ndjson', 'Output as newline-delimited JSON')
    .option('--full', 'Include all fields in JSON output')
    .action(listTasks)

  task
    .command('view <ref>')
    .description('View task details')
    .option('--full', 'Show all metadata')
    .action(viewTask)

  task
    .command('complete <ref>')
    .description('Complete a task')
    .action(completeTask)

  task
    .command('delete <ref>')
    .description('Delete a task')
    .option('--yes', 'Confirm deletion')
    .action(deleteTask)

  task
    .command('add')
    .description('Add a task with explicit flags')
    .requiredOption('--content <text>', 'Task content')
    .option('--due <date>', 'Due date (natural language or YYYY-MM-DD)')
    .option('--priority <p1-p4>', 'Priority level')
    .option('--project <name>', 'Project name or id:xxx')
    .option('--section <id>', 'Section ID')
    .option('--labels <a,b>', 'Comma-separated labels')
    .option('--parent <ref>', 'Parent task reference')
    .option('--description <text>', 'Task description')
    .action(addTask)

  task
    .command('update <ref>')
    .description('Update a task')
    .option('--content <text>', 'New content')
    .option('--due <date>', 'New due date')
    .option('--priority <p1-p4>', 'New priority')
    .option('--labels <a,b>', 'New labels (replaces existing)')
    .option('--description <text>', 'New description')
    .action(updateTask)
}
