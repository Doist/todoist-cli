import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { readStdin } from '@doist/cli-core'
import {
    createCommand,
    type Project,
    type SyncCommand,
    type SyncCommandsMap,
    type TodoistApi,
} from '@doist/todoist-sdk'
import chalk from 'chalk'
import { getApi } from '../../lib/api/core.js'
import { resolveAssigneeId } from '../../lib/collaborators.js'
import { parseDuration } from '../../lib/duration.js'
import { CliError, SyncCommandError } from '../../lib/errors.js'
import { isQuiet } from '../../lib/global-args.js'
import { stripLabelAtPrefix } from '../../lib/labels.js'
import { formatJson } from '../../lib/output.js'
import { paginate } from '../../lib/pagination.js'
import { extractId, isIdRef, resolveProjectRef } from '../../lib/refs.js'
import { parsePriority } from '../../lib/task-list.js'
import { parseTaskList, type TaskInput } from './add-many-input.js'

export interface AddManyOptions {
    project?: string
    stdin?: boolean
    file?: string
    json?: boolean
    dryRun?: boolean
}

type TaskAddArgs = SyncCommandsMap['item_add']
type SectionAddArgs = SyncCommandsMap['section_add']

type PlannedSection = { kind: 'section'; tempId: string; name: string; args: SectionAddArgs }
type PlannedTask = {
    kind: 'task'
    tempId: string
    content: string
    args: TaskAddArgs
    /** 0 for a top-level task, 1 for its subtasks, and so on. */
    depth: number
    /** Where the task sits in the input, such as `[0].subtasks[1]`. */
    path: string
    input: TaskInput
    parentTempId?: string
    /** The section the task lands in (its parent's, for a subtask), as an ID or a new section's temp ID. */
    sectionRef?: string
}

/** What happened to one planned item. */
type Outcome =
    | { status: 'created'; id: string }
    | { status: 'failed'; error: string }
    /** Not created because something it belongs in or under was not created. */
    | { status: 'skipped'; reason: string }

/**
 * One section or task to create, in the order it is sent. Args refer to other
 * planned items by their temp ID.
 */
type PlannedItem = PlannedSection | PlannedTask

/** Everything the input refers to by name, resolved to IDs (or temp IDs of new sections). */
type Resolved = {
    project?: Project
    newSections: PlannedSection[]
    sectionIds: Map<string, string>
    /** The name to show for each section reference: the existing section's own name when matched. */
    sectionNames: Map<string, string>
    assigneeIds: Map<string, string>
}

export async function addManyTasks(options: AddManyOptions): Promise<void> {
    if (options.stdin && options.file) {
        throw new CliError('CONFLICTING_OPTIONS', 'Cannot use both --stdin and --file')
    }
    const tasks = parseTaskList(await readInput(options))
    const allTasks = flatten(tasks)
    const sectionRefs = unique(tasks.flatMap((task) => (task.section ? [task.section] : [])))
    const assigneeRefs = unique(allTasks.flatMap((task) => (task.assignee ? [task.assignee] : [])))
    if (!options.project && (sectionRefs.length > 0 || assigneeRefs.length > 0)) {
        const field = sectionRefs.length > 0 ? 'section' : 'assignee'
        throw new CliError(
            'PROJECT_REQUIRED',
            `The --project flag is required when tasks set "${field}".`,
        )
    }

    const api = await getApi()
    const resolved: Resolved = {
        newSections: [],
        sectionIds: new Map(),
        sectionNames: new Map(),
        assigneeIds: new Map(),
    }
    if (options.project) {
        const project = await resolveProjectRef(api, options.project)
        if (project.isArchived) {
            throw new CliError(
                'PROJECT_ARCHIVED',
                `Cannot create tasks in archived project "${project.name}"`,
            )
        }
        resolved.project = project
        await planSections(api, sectionRefs, project, resolved)
        for (const ref of assigneeRefs) {
            const key = ref.toLowerCase()
            if (!resolved.assigneeIds.has(key)) {
                resolved.assigneeIds.set(key, await resolveAssigneeId(api, ref, project))
            }
        }
    }

    const plannedTasks = planTasks(tasks, resolved)
    if (options.dryRun) {
        printPreview(resolved, plannedTasks)
        return
    }

    const planned: PlannedItem[] = [...resolved.newSections, ...plannedTasks]
    const outcomes = await send(api, planned)
    printReport(resolved, plannedTasks, outcomes, options)
}

/** The Sync API accepts at most this many commands in one request. */
const MAX_COMMANDS_PER_REQUEST = 100

/**
 * Sends the planned items, at most 100 commands per request, and records what
 * happened to each. The Sync API applies commands independently, so a failed
 * command does not undo the others; anything that depended on a failed item is
 * reported as skipped, and never sent if it falls in a later request.
 */
async function send(api: TodoistApi, planned: PlannedItem[]): Promise<Map<string, Outcome>> {
    const outcomes = new Map<string, Outcome>()
    const byTempId = new Map(planned.map((item) => [item.tempId, item]))

    for (let start = 0; start < planned.length; start += MAX_COMMANDS_PER_REQUEST) {
        const batch: PlannedItem[] = []
        for (const item of planned.slice(start, start + MAX_COMMANDS_PER_REQUEST)) {
            const blocker = findBlocker(item, byTempId, outcomes)
            if (blocker) {
                outcomes.set(item.tempId, { status: 'skipped', reason: blocker })
            } else {
                batch.push(item)
            }
        }
        if (batch.length === 0) continue
        // Items created by an earlier request are referred to by their real ID.
        const commands = batch.map((item) => toCommand(withCreatedIds(item, outcomes)))

        let syncStatus: SyncCommandError['syncStatus']
        let tempIdMapping: SyncCommandError['tempIdMapping']
        try {
            const response = await api.sync({ commands })
            syncStatus = response.syncStatus ?? {}
            tempIdMapping = response.tempIdMapping ?? {}
        } catch (err) {
            if (err instanceof SyncCommandError) {
                syncStatus = err.syncStatus
                tempIdMapping = err.tempIdMapping
            } else if (outcomes.size === 0) {
                throw err
            } else {
                const message = err instanceof Error ? err.message : String(err)
                for (const item of planned.slice(start)) {
                    if (!outcomes.has(item.tempId)) {
                        outcomes.set(item.tempId, {
                            status: 'failed',
                            error: `not sent: ${message}`,
                        })
                    }
                }
                return outcomes
            }
        }

        batch.forEach((item, index) => {
            const id = tempIdMapping[item.tempId]
            const blocker = id ? undefined : findBlocker(item, byTempId, outcomes)
            if (id) {
                outcomes.set(item.tempId, { status: 'created', id })
            } else if (blocker) {
                outcomes.set(item.tempId, { status: 'skipped', reason: blocker })
            } else {
                const status = syncStatus[commands[index].uuid]
                const error = status && status !== 'ok' ? status.error : 'No ID came back for it'
                outcomes.set(item.tempId, { status: 'failed', error })
            }
        })
    }
    return outcomes
}

/** Swaps temp IDs of items already created for their real IDs. */
function withCreatedIds(item: PlannedItem, outcomes: Map<string, Outcome>): PlannedItem {
    if (item.kind !== 'task') return item
    const createdId = (ref: string | null | undefined) => {
        const outcome = ref ? outcomes.get(ref) : undefined
        return outcome?.status === 'created' ? outcome.id : ref
    }
    const args = { ...item.args }
    if (args.parentId) args.parentId = createdId(args.parentId)
    if (args.sectionId) args.sectionId = createdId(args.sectionId)
    return { ...item, args }
}

/** Names the parent task or new section that kept this item from being created, if any. */
function findBlocker(
    item: PlannedItem,
    byTempId: Map<string, PlannedItem>,
    outcomes: Map<string, Outcome>,
): string | undefined {
    if (item.kind !== 'task') return undefined
    // Only items already decided count: a parent in the same request has no outcome yet.
    const notCreated = (tempId: string | undefined) => {
        const outcome = tempId === undefined ? undefined : outcomes.get(tempId)
        return outcome !== undefined && outcome.status !== 'created'
    }
    if (notCreated(item.parentTempId)) {
        const parent = byTempId.get(item.parentTempId as string) as PlannedTask
        return `parent "${parent.content}" was not created`
    }
    if (notCreated(item.sectionRef)) {
        const section = byTempId.get(item.sectionRef as string) as PlannedSection
        return `section "${section.name}" was not created`
    }
    return undefined
}

function printReport(
    resolved: Resolved,
    plannedTasks: PlannedTask[],
    outcomes: Map<string, Outcome>,
    options: AddManyOptions,
): void {
    const createdId = (tempId: string): string | undefined => {
        const outcome = outcomes.get(tempId)
        return outcome?.status === 'created' ? outcome.id : undefined
    }
    // A reference is either a planned item's temp ID or an existing item's ID.
    const idOf = (ref: string | undefined): string | null => {
        if (ref === undefined) return null
        return outcomes.has(ref) ? (createdId(ref) ?? null) : ref
    }
    const sections = resolved.newSections.flatMap((section) => {
        const id = createdId(section.tempId)
        return id ? [{ id, name: section.name }] : []
    })
    const tasks = plannedTasks.flatMap((task) => {
        const id = createdId(task.tempId)
        return id ? [{ id, task }] : []
    })
    const problem = (tempId: string) => {
        const outcome = outcomes.get(tempId)
        if (outcome?.status === 'failed') return { label: 'Failed', error: outcome.error }
        if (outcome?.status === 'skipped') return { label: 'Skipped', error: outcome.reason }
        return undefined
    }
    const sectionFailures = resolved.newSections.flatMap((section) => {
        const found = problem(section.tempId)
        return found ? [{ section, ...found }] : []
    })
    const taskFailures = plannedTasks.flatMap((task) => {
        const found = problem(task.tempId)
        return found ? [{ task, ...found }] : []
    })

    if (options.json) {
        console.log(
            formatJson({
                projectId: resolved.project?.id ?? null,
                sections,
                tasks: tasks.map(({ id, task }) => ({
                    id,
                    content: task.content,
                    sectionId: idOf(task.sectionRef),
                    parentId: idOf(task.parentTempId),
                })),
                failures: [
                    ...sectionFailures.map(({ section, error }) => ({
                        type: 'section',
                        name: section.name,
                        error,
                    })),
                    ...taskFailures.map(({ task, error }) => ({
                        type: 'task',
                        path: task.path,
                        content: task.content,
                        error,
                    })),
                ],
            }),
        )
    } else if (isQuiet()) {
        console.log(tasks.map(({ id }) => id).join('\n'))
    } else {
        printCreated(resolved, sections, tasks)
        for (const { section, label, error } of sectionFailures) {
            console.log(`${label}: section ${section.name}: ${error}`)
        }
        for (const { task, label, error } of taskFailures) {
            console.log(`${label}: ${task.content}: ${error}`)
        }
    }

    if (sectionFailures.length > 0 || taskFailures.length > 0) {
        const parts = [`${taskFailures.length} of ${plural(plannedTasks.length, 'task')}`]
        if (sectionFailures.length > 0) {
            parts.push(
                `${sectionFailures.length} of ${plural(resolved.newSections.length, 'section')}`,
            )
        }
        const verb = parts.length === 1 && taskFailures.length === 1 ? 'was' : 'were'
        throw new CliError('PARTIAL_FAILURE', `${parts.join(' and ')} ${verb} not created.`, [
            'Everything else was created. Re-run with only the items listed as failed or skipped, so nothing is created twice.',
        ])
    }
}

function printCreated(
    resolved: Resolved,
    sections: Array<{ id: string; name: string }>,
    tasks: Array<{ id: string; task: PlannedTask }>,
): void {
    const counts = [plural(tasks.length, 'task')]
    if (sections.length > 0) counts.push(plural(sections.length, 'section'))
    const summary = `Created ${counts.join(' and ')}`
    console.log(resolved.project ? `${summary} in ${resolved.project.name}` : summary)
    for (const section of sections) {
        console.log(`  Section: ${section.name} (id:${section.id})`)
    }
    for (const { id, task } of tasks) {
        console.log(`${'  '.repeat(task.depth + 1)}- ${task.content} (id:${id})`)
    }
}

function printPreview(resolved: Resolved, plannedTasks: PlannedTask[]): void {
    const counts = [plural(plannedTasks.length, 'task')]
    if (resolved.newSections.length > 0) {
        counts.push(plural(resolved.newSections.length, 'new section'))
    }
    const target = resolved.project ? resolved.project.name : 'the Inbox'
    console.log(chalk.yellow(`[dry-run] Would add ${counts.join(' and ')} to ${target}:`))
    for (const section of resolved.newSections) {
        console.log(`  New section: ${section.name}`)
    }
    for (const task of plannedTasks) {
        const details = describeFields(task.input, resolved)
        const suffix = details.length > 0 ? ` (${details.join(', ')})` : ''
        console.log(`${'  '.repeat(task.depth + 1)}- ${task.content}${suffix}`)
    }
    console.log(chalk.dim('Run without --dry-run to execute.'))
}

function describeFields(task: TaskInput, resolved: Resolved): string[] {
    const details: string[] = []
    if (task.section) {
        details.push(`section: ${resolved.sectionNames.get(sectionKey(task.section))}`)
    }
    if (task.due) details.push(`due: ${task.due}`)
    if (task.deadline) details.push(`deadline: ${task.deadline}`)
    if (task.priority) details.push(`priority: ${task.priority.toLowerCase()}`)
    const labels = cleanLabels(task.labels)
    if (labels.length > 0) details.push(`labels: ${labels.join(', ')}`)
    if (task.duration) details.push(`duration: ${task.duration}`)
    if (task.assignee) details.push(`assignee: ${task.assignee}`)
    return details
}

function toCommand(item: PlannedItem): SyncCommand {
    return item.kind === 'section'
        ? createCommand('section_add', item.args, item.tempId)
        : createCommand('item_add', item.args, item.tempId)
}

/**
 * Matches each section name to an existing section in the project, by exact
 * name ignoring case, so a re-run does not duplicate sections. Names with no
 * match become new sections, one per name. `id:` references are used as given.
 */
async function planSections(
    api: TodoistApi,
    refs: string[],
    project: Project,
    resolved: Resolved,
): Promise<void> {
    if (refs.length === 0) return

    const { results: existing } = await paginate(
        (cursor, limit) => api.getSections({ projectId: project.id, cursor, limit }),
        { limit: Number.MAX_SAFE_INTEGER },
    )
    const existingByName = new Map(existing.map((section) => [section.name.toLowerCase(), section]))
    for (const ref of refs) {
        const key = sectionKey(ref)
        if (resolved.sectionIds.has(key)) continue
        if (isIdRef(ref)) {
            resolved.sectionIds.set(key, extractId(ref))
            resolved.sectionNames.set(key, ref)
            continue
        }
        const match = existingByName.get(key)
        if (match) {
            resolved.sectionIds.set(key, match.id)
            resolved.sectionNames.set(key, match.name)
            continue
        }
        const name = ref.trim()
        const tempId = crypto.randomUUID()
        resolved.newSections.push({
            kind: 'section',
            tempId,
            name,
            args: { projectId: project.id, name },
        })
        resolved.sectionIds.set(key, tempId)
        resolved.sectionNames.set(key, name)
    }
}

function sectionKey(ref: string): string {
    return isIdRef(ref) ? ref : ref.trim().toLowerCase()
}

/**
 * Flattens the task tree depth first, so every parent is sent before its
 * subtasks. Top-level tasks go to the project; subtasks only name their
 * parent, and inherit its project and section.
 */
function planTasks(tasks: TaskInput[], resolved: Resolved): PlannedTask[] {
    const planned: PlannedTask[] = []
    const visit = (task: TaskInput, parent: PlannedTask | undefined, path: string) => {
        const tempId = crypto.randomUUID()
        const args: TaskAddArgs = { content: task.content }
        let sectionRef = parent?.sectionRef
        if (parent) {
            args.parentId = parent.tempId
        } else if (resolved.project) {
            args.projectId = resolved.project.id
            if (task.section) {
                sectionRef = resolved.sectionIds.get(sectionKey(task.section))
                args.sectionId = sectionRef
            }
        }
        applyFields(args, task, resolved)
        const item: PlannedTask = {
            kind: 'task',
            tempId,
            content: task.content,
            args,
            depth: parent ? parent.depth + 1 : 0,
            path,
            input: task,
            parentTempId: parent?.tempId,
            sectionRef,
        }
        planned.push(item)
        task.subtasks?.forEach((subtask, index) =>
            visit(subtask, item, `${path}.subtasks[${index}]`),
        )
    }
    tasks.forEach((task, index) => visit(task, undefined, `[${index}]`))
    return planned
}

/** Maps the optional fields the same way `td task add` maps its flags. */
function applyFields(args: TaskAddArgs, task: TaskInput, resolved: Resolved): void {
    if (task.description !== undefined) args.description = task.description
    if (task.due) args.due = { string: task.due }
    if (task.deadline) args.deadline = { date: task.deadline }
    if (task.priority) args.priority = parsePriority(task.priority) as TaskAddArgs['priority']
    const labels = cleanLabels(task.labels)
    if (labels.length > 0) args.labels = labels
    if (task.duration) {
        // The input schema has already rejected durations parseDuration can't read.
        const minutes = parseDuration(task.duration)
        if (minutes !== null) args.duration = { amount: minutes, unit: 'minute' }
    }
    if (task.assignee) args.responsibleUid = resolved.assigneeIds.get(task.assignee.toLowerCase())
}

/** Label names without the display-only leading `@`, as `td task add --labels` takes them. */
function cleanLabels(labels: string[] | undefined): string[] {
    return (labels ?? []).map(stripLabelAtPrefix).filter((label) => label.length > 0)
}

function flatten(tasks: TaskInput[]): TaskInput[] {
    return tasks.flatMap((task) => [task, ...flatten(task.subtasks ?? [])])
}

function unique(values: string[]): string[] {
    return [...new Set(values)]
}

async function readInput(options: AddManyOptions): Promise<string> {
    if (options.stdin) return readStdin()
    const filePath = resolve(options.file ?? '')
    try {
        return await readFile(filePath, 'utf8')
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            throw new CliError('FILE_NOT_FOUND', `File not found: ${filePath}`, [
                'Check the file path and try again.',
            ])
        }
        const message = err instanceof Error ? err.message : String(err)
        throw new CliError('FILE_READ_ERROR', `Cannot read file: ${filePath}`, [message])
    }
}

function plural(count: number, noun: string): string {
    return `${count} ${noun}${count === 1 ? '' : 's'}`
}
