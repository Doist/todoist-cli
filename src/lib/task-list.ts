import {
  getApi,
  getCurrentUserId,
  isWorkspaceProject,
  type Project,
  type Section,
} from './api.js'
import { resolveWorkspaceRef } from './refs.js'
import {
  formatTaskRow,
  formatPaginatedJson,
  formatPaginatedNdjson,
  formatNextCursorFooter,
  formatError,
} from './output.js'
import { paginate, LIMITS } from './pagination.js'
import { CollaboratorCache, formatAssignee } from './collaborators.js'
import type { Task, TodoistApi } from '@doist/todoist-api-typescript'
import chalk from 'chalk'

export async function filterByWorkspaceOrPersonal(
  api: TodoistApi,
  tasks: Task[],
  workspace: string | undefined,
  personal: boolean | undefined
): Promise<{ tasks: Task[]; projects: Map<string, Project> }> {
  if (workspace && personal) {
    throw new Error(
      formatError(
        'CONFLICTING_FILTERS',
        '--workspace and --personal are mutually exclusive.'
      )
    )
  }

  const { results: allProjects } = await api.getProjects()
  const projects = new Map(allProjects.map((p) => [p.id, p]))

  if (!workspace && !personal) {
    return { tasks, projects }
  }

  let filtered = tasks
  if (workspace) {
    const ws = await resolveWorkspaceRef(workspace)
    filtered = tasks.filter((t) => {
      const project = projects.get(t.projectId)
      return (
        project && isWorkspaceProject(project) && project.workspaceId === ws.id
      )
    })
  } else if (personal) {
    filtered = tasks.filter((t) => {
      const project = projects.get(t.projectId)
      return project && !isWorkspaceProject(project)
    })
  }

  return { tasks: filtered, projects }
}

export interface TaskListOptions {
  priority?: string
  due?: string
  filter?: string
  label?: string
  parent?: string
  assignee?: string
  unassigned?: boolean
  workspace?: string
  personal?: boolean
  limit?: string
  cursor?: string
  all?: boolean
  json?: boolean
  ndjson?: boolean
  full?: boolean
  raw?: boolean
}

export function parsePriority(p: string): number {
  const match = /^p([1-4])$/.exec(p.toLowerCase())
  if (!match) {
    throw new Error(
      formatError(
        'INVALID_PRIORITY',
        `Invalid priority "${p}". Use p1, p2, p3, or p4.`
      )
    )
  }
  return 5 - parseInt(match[1], 10)
}

function getLocalToday(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

interface FormatGroupedTaskListOptions {
  tasks: Task[]
  project: Project
  sections: Section[]
  projects: Map<string, Project>
  collaboratorCache: CollaboratorCache
  raw?: boolean
}

function formatGroupedTaskList({
  tasks,
  project,
  sections,
  projects,
  collaboratorCache,
  raw = false,
}: FormatGroupedTaskListOptions): string {
  if (tasks.length === 0) {
    return 'No tasks found.'
  }

  const taskIds = new Set(tasks.map((t) => t.id))
  const childrenMap = new Map<string, Task[]>()
  for (const task of tasks) {
    if (task.parentId && taskIds.has(task.parentId)) {
      const children = childrenMap.get(task.parentId) || []
      children.push(task)
      childrenMap.set(task.parentId, children)
    }
  }

  function renderTask(task: Task, indent: number): void {
    const assignee = formatAssignee({
      userId: task.responsibleUid,
      projectId: task.projectId,
      projects,
      cache: collaboratorCache,
    })
    lines.push(
      formatTaskRow({ task, assignee: assignee ?? undefined, raw, indent })
    )
    lines.push('')
    const children = childrenMap.get(task.id) || []
    for (const child of children) {
      renderTask(child, indent + 1)
    }
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
    const topLevel = noSection.filter(
      (t) => !t.parentId || !taskIds.has(t.parentId)
    )
    for (const task of topLevel) {
      renderTask(task, 0)
    }
  }

  for (const section of sections) {
    const sectionTasks = bySectionId.get(section.id)
    if (sectionTasks && sectionTasks.length > 0) {
      lines.push(`${section.name} (${sectionTasks.length})`)
      const topLevel = sectionTasks.filter(
        (t) => !t.parentId || !taskIds.has(t.parentId)
      )
      for (const task of topLevel) {
        renderTask(task, 0)
      }
    }
  }

  return lines.join('\n').trimEnd()
}

interface FormatFlatTaskListOptions {
  tasks: Task[]
  projects: Map<string, Project>
  collaboratorCache: CollaboratorCache
  raw?: boolean
}

function formatFlatTaskList({
  tasks,
  projects,
  collaboratorCache,
  raw = false,
}: FormatFlatTaskListOptions): string {
  if (tasks.length === 0) {
    return 'No tasks found.'
  }

  const blocks = tasks.map((task) => {
    const projectName = projects.get(task.projectId)?.name
    const assignee = formatAssignee({
      userId: task.responsibleUid,
      projectId: task.projectId,
      projects,
      cache: collaboratorCache,
    })
    return formatTaskRow({
      task,
      projectName,
      assignee: assignee ?? undefined,
      raw,
    })
  })

  return blocks.join('\n\n')
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
      : LIMITS.tasks

  let tasks: Task[]
  let nextCursor: string | null

  if (options.filter) {
    const result = await paginate(
      (cursor, limit) =>
        api.getTasksByFilter({
          query: options.filter!,
          cursor: cursor ?? undefined,
          limit,
        }),
      { limit: targetLimit, startCursor: options.cursor }
    )
    tasks = result.results
    nextCursor = result.nextCursor
  } else {
    const result = await paginate(
      (cursor, limit) =>
        projectId
          ? api.getTasks({ projectId, cursor: cursor ?? undefined, limit })
          : api.getTasks({ cursor: cursor ?? undefined, limit }),
      { limit: targetLimit, startCursor: options.cursor }
    )
    tasks = result.results
    nextCursor = result.nextCursor
  }

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

  if (options.parent) {
    filtered = filtered.filter((t) => t.parentId === options.parent)
  }

  if (options.label) {
    const labels = options.label.split(',').map((l) => l.trim().toLowerCase())
    filtered = filtered.filter((t) =>
      t.labels.some((tl) => labels.includes(tl.toLowerCase()))
    )
  }

  if (options.unassigned) {
    filtered = filtered.filter((t) => !t.responsibleUid)
  } else if (options.assignee) {
    let assigneeId: string
    if (options.assignee.toLowerCase() === 'me') {
      assigneeId = await getCurrentUserId()
    } else if (options.assignee.startsWith('id:')) {
      assigneeId = options.assignee.slice(3)
    } else {
      throw new Error(
        formatError(
          'INVALID_ASSIGNEE_FILTER',
          'Assignee filter requires "me" or "id:xxx" format.',
          ['Use --assignee me or --assignee id:12345']
        )
      )
    }
    filtered = filtered.filter((t) => t.responsibleUid === assigneeId)
  }

  const filterResult = await filterByWorkspaceOrPersonal(
    api,
    filtered,
    options.workspace,
    options.personal
  )
  filtered = filterResult.tasks

  if (options.json) {
    console.log(
      formatPaginatedJson(
        { results: filtered, nextCursor },
        'task',
        options.full
      )
    )
    return
  }

  if (options.ndjson) {
    console.log(
      formatPaginatedNdjson(
        { results: filtered, nextCursor },
        'task',
        options.full
      )
    )
    return
  }

  const { projects } = filterResult
  const collaboratorCache = new CollaboratorCache()
  await collaboratorCache.preload(api, filtered, projects)

  if (projectId) {
    const [projectRes, sectionsRes] = await Promise.all([
      api.getProject(projectId),
      api.getSections({ projectId }),
    ])
    console.log(
      formatGroupedTaskList({
        tasks: filtered,
        project: projectRes,
        sections: sectionsRes.results,
        projects,
        collaboratorCache,
        raw: options.raw,
      })
    )
  } else {
    console.log(
      formatFlatTaskList({
        tasks: filtered,
        projects,
        collaboratorCache,
        raw: options.raw,
      })
    )
  }
  console.log(formatNextCursorFooter(nextCursor))
}
