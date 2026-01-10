import { Command } from 'commander'
import { getApi } from '../lib/api.js'
import { formatTaskView, formatError } from '../lib/output.js'
import {
  requireIdRef,
  resolveParentTaskId,
  resolveProjectId,
  resolveProjectRef,
  resolveSectionId,
  resolveTaskRef,
} from '../lib/refs.js'
import {
  listTasksForProject,
  parsePriority,
  type TaskListOptions,
} from '../lib/task-list.js'
import { resolveAssigneeId } from '../lib/collaborators.js'

interface ListOptions extends TaskListOptions {
  project?: string
  parent?: string
  label?: string
  assignee?: string
  unassigned?: boolean
  workspace?: string
  personal?: boolean
}

interface ViewOptions {
  full?: boolean
}

async function listTasks(options: ListOptions): Promise<void> {
  const api = await getApi()

  let projectId: string | null = null
  if (options.project) {
    projectId = await resolveProjectId(api, options.project)
  }

  let parentId: string | undefined
  if (options.parent) {
    const parentTask = await resolveTaskRef(api, options.parent)
    parentId = parentTask.id
    if (!projectId) projectId = parentTask.projectId
  }

  await listTasksForProject(projectId, { ...options, parent: parentId })
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

async function uncompleteTask(ref: string): Promise<void> {
  const api = await getApi()
  const id = requireIdRef(ref, 'task')
  await api.reopenTask(id)
  console.log(`Reopened task ${id}`)
}

async function deleteTask(
  ref: string,
  options: { yes?: boolean }
): Promise<void> {
  const api = await getApi()
  const task = await resolveTaskRef(api, ref)

  if (!options.yes) {
    console.log(`Would delete: ${task.content}`)
    console.log('Use --yes to confirm.')
    return
  }

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
  assignee?: string
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

  let project = null
  if (options.project) {
    project = await resolveProjectRef(api, options.project)
    args.projectId = project.id
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

  if (options.assignee) {
    if (!project) {
      throw new Error(
        formatError(
          'PROJECT_REQUIRED',
          'The --project flag is required when using --assignee.'
        )
      )
    }
    args.assigneeId = await resolveAssigneeId(api, options.assignee, project)
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
  assignee?: string
  unassign?: boolean
}

async function updateTask(ref: string, options: UpdateOptions): Promise<void> {
  const api = await getApi()
  const task = await resolveTaskRef(api, ref)

  const args: Parameters<typeof api.updateTask>[1] = {}

  if (options.content) args.content = options.content
  if (options.due) args.dueString = options.due
  if (options.priority) args.priority = parsePriority(options.priority)
  if (options.labels)
    args.labels = options.labels.split(',').map((l) => l.trim())
  if (options.description) args.description = options.description

  if (options.unassign) {
    args.assigneeId = null
  } else if (options.assignee) {
    const project = await api.getProject(task.projectId)
    args.assigneeId = await resolveAssigneeId(api, options.assignee, project)
  }

  const updated = await api.updateTask(task.id, args)
  console.log(`Updated: ${updated.content}`)
}

interface MoveOptions {
  project?: string
  section?: string
  parent?: string
}

async function moveTask(ref: string, options: MoveOptions): Promise<void> {
  if (!options.project && !options.section && !options.parent) {
    throw new Error(
      formatError(
        'MISSING_DESTINATION',
        'At least one of --project, --section, or --parent is required.'
      )
    )
  }

  const api = await getApi()
  const task = await resolveTaskRef(api, ref)

  const targetProjectId = options.project
    ? await resolveProjectId(api, options.project)
    : task.projectId

  let targetSectionId: string | undefined
  if (options.section) {
    targetSectionId = await resolveSectionId(
      api,
      options.section,
      targetProjectId
    )
  }

  if (options.parent) {
    const parentId = await resolveParentTaskId(
      api,
      options.parent,
      targetProjectId,
      targetSectionId ?? task.sectionId ?? undefined
    )
    await api.moveTask(task.id, { parentId })
  } else if (targetSectionId) {
    await api.moveTask(task.id, { sectionId: targetSectionId })
  } else {
    await api.moveTask(task.id, { projectId: targetProjectId })
  }
  console.log(`Moved: ${task.content}`)
}

export function registerTaskCommand(program: Command): void {
  const task = program.command('task').description('Manage tasks')

  task
    .command('list')
    .description('List tasks')
    .option('--project <name>', 'Filter by project name or id:xxx')
    .option('--parent <ref>', 'Filter subtasks of a parent task')
    .option('--label <name>', 'Filter by label (comma-separated for multiple)')
    .option('--priority <p1-p4>', 'Filter by priority')
    .option(
      '--due <date>',
      'Filter by due date (today, overdue, or YYYY-MM-DD)'
    )
    .option('--filter <query>', 'Raw Todoist filter query')
    .option('--assignee <ref>', 'Filter by assignee (me or id:xxx)')
    .option('--unassigned', 'Show only unassigned tasks')
    .option('--workspace <name>', 'Filter to tasks in workspace')
    .option('--personal', 'Filter to tasks in personal projects')
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
    .command('uncomplete <ref>')
    .description('Reopen a completed task (requires id:xxx)')
    .action(uncompleteTask)

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
    .option('--assignee <ref>', 'Assign to user (name, email, id:xxx, or "me")')
    .action(addTask)

  task
    .command('update <ref>')
    .description('Update a task')
    .option('--content <text>', 'New content')
    .option('--due <date>', 'New due date')
    .option('--priority <p1-p4>', 'New priority')
    .option('--labels <a,b>', 'New labels (replaces existing)')
    .option('--description <text>', 'New description')
    .option('--assignee <ref>', 'Assign to user (name, email, id:xxx, or "me")')
    .option('--unassign', 'Remove assignee')
    .action(updateTask)

  task
    .command('move <ref>')
    .description('Move task to project/section/parent')
    .option('--project <ref>', 'Target project (name or id:xxx)')
    .option('--section <ref>', 'Target section (name or id:xxx)')
    .option('--parent <ref>', 'Parent task (name or id:xxx)')
    .action(moveTask)
}
