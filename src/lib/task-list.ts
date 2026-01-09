import { getApi, type Project, type Section } from './api.js'
import { formatTaskRow, formatPaginatedJson, formatPaginatedNdjson, formatNextCursorFooter, formatError } from './output.js'
import { paginate, DEFAULT_LIMIT } from './pagination.js'
import type { Task } from '@doist/todoist-api-typescript'
import chalk from 'chalk'

export interface TaskListOptions {
  priority?: string
  due?: string
  filter?: string
  limit?: string
  cursor?: string
  all?: boolean
  json?: boolean
  ndjson?: boolean
  full?: boolean
}

export function parsePriority(p: string): number {
  const match = /^p([1-4])$/.exec(p.toLowerCase())
  if (!match) {
    throw new Error(
      formatError('INVALID_PRIORITY', `Invalid priority "${p}". Use p1, p2, p3, or p4.`)
    )
  }
  return 5 - parseInt(match[1], 10)
}

function getLocalToday(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function formatGroupedTaskList(
  tasks: Task[],
  project: Project,
  sections: Section[]
): string {
  if (tasks.length === 0) {
    return 'No tasks found.'
  }

  const lines: string[] = []
  const noSection = tasks.filter((t) => !t.sectionId)
  const bySectionId = new Map<string, Task[]>()

  for (const task of tasks) {
    if (task.sectionId) {
      const list = bySectionId.get(task.sectionId) || []
      list.push(task)
      bySectionId.set(task.sectionId, list)
    }
  }

  lines.push(chalk.bold(`${project.name} (${tasks.length})`))
  lines.push('')

  if (noSection.length > 0) {
    lines.push(chalk.italic.dim(`(no section) (${noSection.length})`))
    for (const task of noSection) {
      lines.push(formatTaskRow(task))
    }
    lines.push('')
  }

  for (const section of sections) {
    const sectionTasks = bySectionId.get(section.id)
    if (sectionTasks && sectionTasks.length > 0) {
      lines.push(`${section.name} (${sectionTasks.length})`)
      for (const task of sectionTasks) {
        lines.push(formatTaskRow(task))
      }
      lines.push('')
    }
  }

  return lines.join('\n').trimEnd()
}

function formatFlatTaskList(tasks: Task[], projects: Map<string, Project>): string {
  if (tasks.length === 0) {
    return 'No tasks found.'
  }

  const lines = tasks.map((task) => {
    const projectName = projects.get(task.projectId)?.name
    return formatTaskRow(task, projectName)
  })

  return lines.join('\n')
}

export async function listTasksForProject(
  projectId: string | null,
  options: TaskListOptions
): Promise<void> {
  const api = await getApi()

  const targetLimit = options.all
    ? Number.MAX_SAFE_INTEGER
    : options.limit
      ? parseInt(options.limit, 10)
      : DEFAULT_LIMIT

  const { results: tasks, nextCursor } = await paginate(
    (cursor, limit) =>
      projectId
        ? api.getTasks({ projectId, cursor: cursor ?? undefined, limit })
        : api.getTasks({ cursor: cursor ?? undefined, limit }),
    { limit: targetLimit, startCursor: options.cursor }
  )

  let filtered = tasks

  if (options.priority) {
    const priority = parsePriority(options.priority)
    filtered = filtered.filter((t) => t.priority === priority)
  }

  if (options.due) {
    const today = getLocalToday()
    if (options.due === 'today') {
      filtered = filtered.filter((t) => t.due?.date === today)
    } else if (options.due === 'overdue') {
      filtered = filtered.filter((t) => t.due && t.due.date < today)
    } else {
      filtered = filtered.filter((t) => t.due?.date === options.due)
    }
  }

  if (options.json) {
    console.log(formatPaginatedJson({ results: filtered, nextCursor }, 'task', options.full))
    return
  }

  if (options.ndjson) {
    console.log(formatPaginatedNdjson({ results: filtered, nextCursor }, 'task', options.full))
    return
  }

  if (projectId) {
    const [projectRes, sectionsRes] = await Promise.all([
      api.getProject(projectId),
      api.getSections({ projectId }),
    ])
    console.log(formatGroupedTaskList(filtered, projectRes, sectionsRes.results))
  } else {
    const { results: allProjects } = await api.getProjects()
    const projects = new Map(allProjects.map((p) => [p.id, p]))
    console.log(formatFlatTaskList(filtered, projects))
  }
  console.log(formatNextCursorFooter(nextCursor))
}
