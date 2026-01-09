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

export function formatJson<T>(data: T): string {
  return JSON.stringify(data, null, 2)
}

export function formatNdjson<T>(items: T[]): string {
  return items.map((item) => JSON.stringify(item)).join('\n')
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
