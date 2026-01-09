import chalk from 'chalk'
import type { Task } from '@doist/todoist-api-typescript'
import type { Project } from './api.js'

const PRIORITY_COLORS: Record<number, (s: string) => string> = {
  4: chalk.red,     // p1 = priority 4 in API (highest)
  3: chalk.yellow,  // p2
  2: chalk.blue,    // p3
  1: chalk.gray,    // p4 (lowest/none)
}

const PRIORITY_LABELS: Record<number, string> = {
  4: 'p1',
  3: 'p2',
  2: 'p3',
  1: 'p4',
}

export function formatPriority(priority: number): string {
  const label = PRIORITY_LABELS[priority] || 'p4'
  const colorFn = PRIORITY_COLORS[priority] || chalk.gray
  return colorFn(label)
}

export function formatDue(due: Task['due']): string {
  if (!due) return ''
  return due.string || due.date
}

export function formatTaskRow(task: Task, projectName?: string): string {
  const id = chalk.dim(task.id)
  const priority = formatPriority(task.priority)
  const content = task.content
  const due = formatDue(task.due)
  const project = projectName ? chalk.cyan(projectName) : ''

  const parts = [id, priority, content]
  if (due) parts.push(chalk.green(due))
  if (project) parts.push(project)

  return parts.join('  ')
}

export function formatTaskView(task: Task, project?: Project, full = false): string {
  const lines: string[] = []

  lines.push(`${chalk.bold(task.content)}`)
  lines.push('')
  lines.push(`ID:       ${task.id}`)
  lines.push(`Priority: ${formatPriority(task.priority)}`)
  lines.push(`Project:  ${project?.name || task.projectId}`)

  if (task.due) {
    lines.push(`Due:      ${formatDue(task.due)}`)
  }

  if (task.labels.length > 0) {
    lines.push(`Labels:   ${task.labels.join(', ')}`)
  }

  if (task.description) {
    lines.push('')
    lines.push('Description:')
    lines.push(task.description)
  }

  if (full) {
    lines.push('')
    lines.push(chalk.dim('--- Metadata ---'))
    if (task.addedAt) lines.push(`Created:   ${task.addedAt}`)
    if (task.addedByUid) lines.push(`Creator:   ${task.addedByUid}`)
    if (task.responsibleUid) lines.push(`Assignee:  ${task.responsibleUid}`)
    if (task.parentId) lines.push(`Parent:    ${task.parentId}`)
    if (task.sectionId) lines.push(`Section:   ${task.sectionId}`)
    lines.push(`URL:       ${task.url}`)
  }

  return lines.join('\n')
}

type FieldPicker<T> = (item: T) => Partial<T>

const TASK_ESSENTIAL_FIELDS = ['id', 'content', 'description', 'priority', 'due', 'projectId', 'sectionId', 'parentId', 'labels', 'url'] as const
const PROJECT_ESSENTIAL_FIELDS = ['id', 'name', 'color', 'isFavorite', 'parentId', 'viewStyle', 'url'] as const
const LABEL_ESSENTIAL_FIELDS = ['id', 'name', 'color', 'isFavorite'] as const
const SECTION_ESSENTIAL_FIELDS = ['id', 'name', 'projectId', 'sectionOrder', 'url'] as const
const COMMENT_ESSENTIAL_FIELDS = ['id', 'content', 'postedAt', 'taskId', 'projectId'] as const

function pickFields<T extends object>(item: T, fields: readonly string[]): Partial<T> {
  const result: Partial<T> = {}
  for (const field of fields) {
    if (field in item) {
      (result as Record<string, unknown>)[field] = (item as Record<string, unknown>)[field]
    }
  }
  return result
}

export type EntityType = 'task' | 'project' | 'label' | 'section' | 'comment'

function getEssentialFields(type: EntityType): readonly string[] {
  switch (type) {
    case 'task': return TASK_ESSENTIAL_FIELDS
    case 'project': return PROJECT_ESSENTIAL_FIELDS
    case 'label': return LABEL_ESSENTIAL_FIELDS
    case 'section': return SECTION_ESSENTIAL_FIELDS
    case 'comment': return COMMENT_ESSENTIAL_FIELDS
  }
}

export function formatJson<T extends object>(data: T | T[], type?: EntityType, full = false): string {
  if (full || !type) {
    return JSON.stringify(data, null, 2)
  }
  const fields = getEssentialFields(type)
  if (Array.isArray(data)) {
    return JSON.stringify(data.map((item) => pickFields(item, fields)), null, 2)
  }
  return JSON.stringify(pickFields(data, fields), null, 2)
}

export function formatNdjson<T extends object>(items: T[], type?: EntityType, full = false): string {
  if (full || !type) {
    return items.map((item) => JSON.stringify(item)).join('\n')
  }
  const fields = getEssentialFields(type)
  return items.map((item) => JSON.stringify(pickFields(item, fields))).join('\n')
}

export function formatError(code: string, message: string, hints?: string[]): string {
  const lines = [`Error: ${code}`, message]
  if (hints && hints.length > 0) {
    lines.push('')
    for (const hint of hints) {
      lines.push(`  - ${hint}`)
    }
  }
  return chalk.red(lines.join('\n'))
}

export interface PaginatedOutput<T> {
  results: T[]
  nextCursor: string | null
}

export function formatPaginatedJson<T extends object>(
  data: PaginatedOutput<T>,
  type?: EntityType,
  full = false
): string {
  const fields = type && !full ? getEssentialFields(type) : null
  const results = fields
    ? data.results.map((item) => pickFields(item, fields))
    : data.results

  return JSON.stringify({ results, nextCursor: data.nextCursor }, null, 2)
}

export function formatPaginatedNdjson<T extends object>(
  data: PaginatedOutput<T>,
  type?: EntityType,
  full = false
): string {
  const fields = type && !full ? getEssentialFields(type) : null
  const lines = data.results.map((item) =>
    JSON.stringify(fields ? pickFields(item, fields) : item)
  )

  if (data.nextCursor) {
    lines.push(JSON.stringify({ _meta: true, nextCursor: data.nextCursor }))
  }

  return lines.join('\n')
}

export function formatNextCursorFooter(nextCursor: string | null): string {
  if (!nextCursor) return ''
  return chalk.dim(`\n... more items exist. Use --all to fetch everything.`)
}
