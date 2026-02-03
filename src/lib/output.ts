import type { Task } from '@doist/todoist-api-typescript'
import chalk from 'chalk'
import type { Project } from './api/core.js'
import { formatDuration } from './duration.js'
import { renderMarkdown } from './markdown.js'
import {
    commentUrl,
    filterUrl,
    labelUrl,
    projectCommentUrl,
    projectUrl,
    sectionUrl,
    taskUrl,
} from './urls.js'

const PRIORITY_COLORS: Record<number, (s: string) => string> = {
    4: chalk.red, // p1 = priority 4 in API (highest)
    3: chalk.yellow, // p2
    2: chalk.blue, // p3
    1: chalk.gray, // p4 (lowest/none)
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

export function formatDueDate(dateStr: string): string {
    // Extract just the date part (YYYY-MM-DD) in case dateStr contains a time
    const dateOnly = dateStr.split('T')[0]
    const date = new Date(`${dateOnly}T00:00:00`)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatDue(due: Task['due'] | undefined): string {
    if (!due) return ''
    if (due.isRecurring) {
        return `${formatDueDate(due.date)} (${due.string})`
    }
    return due.string || due.date
}

export interface FormatTaskRowOptions {
    task: Task
    projectName?: string
    assignee?: string
    raw?: boolean
    indent?: number
    showUrl?: boolean
}

export function formatTaskRow({
    task,
    projectName,
    assignee,
    raw = false,
    indent = 0,
    showUrl = false,
}: FormatTaskRowOptions): string {
    const content = raw ? task.content : renderMarkdown(task.content)
    const baseIndent = '  '
    const extraIndent = '  '.repeat(indent)
    const line1 = baseIndent + extraIndent + content
    const metaParts = [chalk.dim(`id:${task.id}`), formatPriority(task.priority)]
    const due = formatDue(task.due)
    if (due) metaParts.push(chalk.green(due))
    if (task.duration) {
        metaParts.push(chalk.yellow(formatDuration(task.duration.amount, task.duration.unit)))
    }
    if (task.deadline) metaParts.push(chalk.red(task.deadline.date))
    if (projectName) metaParts.push(chalk.cyan(projectName))
    if (assignee) metaParts.push(chalk.magenta(assignee))
    const line2 = baseIndent + extraIndent + metaParts.join('  ')
    if (showUrl) {
        const line3 = baseIndent + extraIndent + chalk.dim(taskUrl(task.id))
        return `${line1}\n${line2}\n${line3}`
    }
    return `${line1}\n${line2}`
}

export interface FormatTaskViewOptions {
    task: Task
    project?: Project
    parentTask?: Task
    subtaskCount?: number
    full?: boolean
    raw?: boolean
}

export function formatTaskView({
    task,
    project,
    parentTask,
    subtaskCount,
    full = false,
    raw = false,
}: FormatTaskViewOptions): string {
    const lines: string[] = []
    const content = raw ? task.content : renderMarkdown(task.content)

    lines.push(content)
    lines.push('')
    lines.push(`ID:       ${task.id}`)
    if (task.isUncompletable) {
        lines.push(`Type:     reference (uncompletable)`)
    }
    lines.push(`Priority: ${formatPriority(task.priority)}`)
    lines.push(`Project:  ${project?.name || task.projectId}`)
    if (parentTask) {
        lines.push(`Parent:   ${parentTask.content} (id:${parentTask.id})`)
    }
    if (subtaskCount !== undefined && subtaskCount > 0) {
        lines.push(`Subtasks: ${subtaskCount} active`)
    }

    if (task.due) {
        lines.push(`Due:      ${formatDue(task.due)}`)
    }

    if (task.duration) {
        lines.push(`Duration: ${formatDuration(task.duration.amount, task.duration.unit)}`)
    }

    if (task.deadline) {
        lines.push(`Deadline: ${task.deadline.date}`)
    }

    if (task.labels.length > 0) {
        lines.push(`Labels:   ${task.labels.join(', ')}`)
    }

    lines.push(`URL:      ${taskUrl(task.id)}`)

    if (task.description) {
        lines.push('')
        lines.push('Description:')
        const desc = raw ? task.description : renderMarkdown(task.description)
        lines.push(desc)
    }

    if (full) {
        lines.push('')
        lines.push(chalk.dim('--- Metadata ---'))
        if (task.addedAt) lines.push(`Created:   ${task.addedAt}`)
        if (task.addedByUid) lines.push(`Creator:   ${task.addedByUid}`)
        if (task.responsibleUid) lines.push(`Assignee:  ${task.responsibleUid}`)
        if (task.parentId) lines.push(`Parent:    ${task.parentId}`)
        if (task.sectionId) lines.push(`Section:   ${task.sectionId}`)
    }

    return lines.join('\n')
}

const TASK_ESSENTIAL_FIELDS = [
    'id',
    'content',
    'description',
    'priority',
    'due',
    'deadline',
    'duration',
    'projectId',
    'sectionId',
    'parentId',
    'labels',
    'url',
    'responsibleUid',
    'isUncompletable',
] as const
const PROJECT_ESSENTIAL_FIELDS = [
    'id',
    'name',
    'color',
    'isFavorite',
    'parentId',
    'viewStyle',
    'url',
    'workspaceId',
] as const
const LABEL_ESSENTIAL_FIELDS = ['id', 'name', 'color', 'isFavorite'] as const
const SECTION_ESSENTIAL_FIELDS = ['id', 'name', 'projectId', 'sectionOrder', 'url'] as const
const COMMENT_ESSENTIAL_FIELDS = [
    'id',
    'content',
    'postedAt',
    'taskId',
    'projectId',
    'fileAttachment',
    'hasAttachment',
] as const
const REMINDER_ESSENTIAL_FIELDS = ['id', 'itemId', 'type', 'due', 'minuteOffset'] as const
const FILTER_ESSENTIAL_FIELDS = ['id', 'name', 'query', 'color', 'isFavorite'] as const
const NOTIFICATION_ESSENTIAL_FIELDS = [
    'id',
    'type',
    'isUnread',
    'createdAt',
    'fromUser',
    'project',
    'task',
] as const

function pickFields<T extends object>(item: T, fields: readonly string[]): Partial<T> {
    const result: Partial<T> = {}
    for (const field of fields) {
        if (field in item) {
            ;(result as Record<string, unknown>)[field] = (item as Record<string, unknown>)[field]
        }
    }
    return result
}

function addWebUrl<T extends { id: string }>(item: T, type: EntityType): T & { webUrl: string } {
    const record = item as Record<string, unknown>
    let url: string
    switch (type) {
        case 'task':
            url = taskUrl(item.id)
            break
        case 'project':
            url = projectUrl(item.id)
            break
        case 'label':
            url = labelUrl(item.id)
            break
        case 'filter':
            url = filterUrl(item.id)
            break
        case 'section':
            url = sectionUrl(item.id)
            break
        case 'comment':
            if (record.taskId) {
                url = commentUrl(record.taskId as string, item.id)
            } else if (record.projectId) {
                url = projectCommentUrl(record.projectId as string, item.id)
            } else {
                url = ''
            }
            break
        case 'reminder':
            url = ''
            break
        case 'notification':
            url = ''
            break
    }
    return { ...item, webUrl: url }
}

export type EntityType =
    | 'task'
    | 'project'
    | 'label'
    | 'section'
    | 'comment'
    | 'reminder'
    | 'filter'
    | 'notification'

function getEssentialFields(type: EntityType): readonly string[] {
    switch (type) {
        case 'task':
            return TASK_ESSENTIAL_FIELDS
        case 'project':
            return PROJECT_ESSENTIAL_FIELDS
        case 'label':
            return LABEL_ESSENTIAL_FIELDS
        case 'section':
            return SECTION_ESSENTIAL_FIELDS
        case 'comment':
            return COMMENT_ESSENTIAL_FIELDS
        case 'reminder':
            return REMINDER_ESSENTIAL_FIELDS
        case 'filter':
            return FILTER_ESSENTIAL_FIELDS
        case 'notification':
            return NOTIFICATION_ESSENTIAL_FIELDS
    }
}

function hasId<T extends object>(item: T): item is T & { id: string } {
    return 'id' in item && typeof (item as Record<string, unknown>).id === 'string'
}

function processItem<T extends object>(
    item: T,
    type: EntityType,
    full: boolean,
    showUrl: boolean,
): object {
    const base = full ? item : pickFields(item, getEssentialFields(type))
    if (showUrl && hasId(item)) {
        return { ...base, webUrl: addWebUrl(item, type).webUrl }
    }
    return base
}

export function formatJson<T extends object>(
    data: T | T[],
    type?: EntityType,
    full = false,
    showUrl = false,
): string {
    if (!type) {
        return JSON.stringify(data, null, 2)
    }
    if (Array.isArray(data)) {
        return JSON.stringify(
            data.map((item) => processItem(item, type, full, showUrl)),
            null,
            2,
        )
    }
    return JSON.stringify(processItem(data, type, full, showUrl), null, 2)
}

export function formatNdjson<T extends object>(
    items: T[],
    type?: EntityType,
    full = false,
    showUrl = false,
): string {
    if (!type) {
        return items.map((item) => JSON.stringify(item)).join('\n')
    }
    return items.map((item) => JSON.stringify(processItem(item, type, full, showUrl))).join('\n')
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
    full = false,
    showUrl = false,
): string {
    if (!type) {
        return JSON.stringify(data, null, 2)
    }
    const results = data.results.map((item) => processItem(item, type, full, showUrl))
    return JSON.stringify({ results, nextCursor: data.nextCursor }, null, 2)
}

export function formatPaginatedNdjson<T extends object>(
    data: PaginatedOutput<T>,
    type?: EntityType,
    full = false,
    showUrl = false,
): string {
    const lines = data.results.map((item) => {
        if (!type) {
            return JSON.stringify(item)
        }
        return JSON.stringify(processItem(item, type, full, showUrl))
    })

    if (data.nextCursor) {
        lines.push(JSON.stringify({ _meta: true, nextCursor: data.nextCursor }))
    }

    return lines.join('\n')
}

export function formatNextCursorFooter(nextCursor: string | null): string {
    if (!nextCursor) return ''
    return chalk.dim(`\n... more items exist. Use --all to fetch everything.`)
}

export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
