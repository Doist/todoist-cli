import chalk from 'chalk'
import { Command } from 'commander'
import { getApi } from '../lib/api/core.js'
import { CliError } from '../lib/errors.js'
import { isJsonMode, isNdjsonMode, isQuiet } from '../lib/global-args.js'
import { formatPriority } from '../lib/output.js'
import { resolveProjectRef, resolveWorkspaceRef } from '../lib/refs.js'
import { stopEarlySpinner } from '../lib/spinner.js'
import { sanitizeInline, StreamWriter, truncateInline, type WatchEvent } from '../lib/watch/core.js'
import {
    parseWatchResources,
    TodoistWatchSession,
    validateWatchFilters,
    type WatchFilterOptions,
    type WatchResourceName,
} from '../lib/watch/todoist.js'

interface WatchOptions {
    resource?: string[]
    project?: string
    workspace?: string
    label?: string
    oneEvent?: boolean
    ndjson?: boolean
}

type SyncRecord = Record<string, unknown>

function text(record: SyncRecord, key: string): string | undefined {
    const value = record[key]
    if (typeof value === 'string' && value.length > 0) return truncateInline(value)
    return undefined
}

function dueLabel(record: SyncRecord): string | undefined {
    const due = record.due
    if (!due || typeof due !== 'object') return undefined
    const dueRecord = due as SyncRecord
    return text(dueRecord, 'string') ?? text(dueRecord, 'date')
}

/** Field lines for the human block, per resource. Values are sanitized. */
function describeRecord(resource: WatchResourceName, record: SyncRecord): Array<[string, string]> {
    const fields: Array<[string, string | undefined]> = []
    switch (resource) {
        case 'task': {
            fields.push(['content', text(record, 'content')])
            fields.push(['description', text(record, 'description')])
            fields.push(['due', dueLabel(record)])
            if (typeof record.priority === 'number') {
                fields.push(['priority', formatPriority(record.priority)])
            }
            if (Array.isArray(record.labels) && record.labels.length > 0) {
                fields.push(['labels', truncateInline(record.labels.join(', '))])
            }
            if (record.checked === true) fields.push(['completed', 'yes'])
            fields.push(['project', text(record, 'projectId')])
            fields.push(['section', text(record, 'sectionId')])
            break
        }
        case 'project': {
            fields.push(['name', text(record, 'name')])
            fields.push(['workspace', text(record, 'workspaceId')])
            fields.push(['parent', text(record, 'parentId')])
            if (record.isArchived === true) fields.push(['archived', 'yes'])
            break
        }
        case 'section': {
            fields.push(['name', text(record, 'name')])
            fields.push(['project', text(record, 'projectId')])
            if (record.isArchived === true) fields.push(['archived', 'yes'])
            break
        }
        case 'comment': {
            fields.push(['content', text(record, 'content')])
            fields.push(['task', text(record, 'itemId')])
            fields.push(['project', text(record, 'projectId')])
            const attachment = record.fileAttachment
            if (attachment && typeof attachment === 'object') {
                fields.push(['attachment', text(attachment as SyncRecord, 'fileName')])
            }
            break
        }
        case 'label': {
            fields.push(['name', text(record, 'name')])
            fields.push(['color', text(record, 'color')])
            break
        }
        case 'filter': {
            fields.push(['name', text(record, 'name')])
            fields.push(['query', text(record, 'query')])
            break
        }
        case 'reminder': {
            fields.push(['type', text(record, 'type')])
            fields.push(['task', text(record, 'itemId')])
            fields.push(['due', dueLabel(record)])
            if (typeof record.minuteOffset === 'number') {
                fields.push(['offset', `${record.minuteOffset}m before due`])
            }
            break
        }
        case 'notification': {
            fields.push(['type', text(record, 'notificationType')])
            const fromUser = record.fromUser
            if (fromUser && typeof fromUser === 'object') {
                fields.push(['from', text(fromUser as SyncRecord, 'fullName')])
            }
            fields.push(['task', text(record, 'itemContent') ?? text(record, 'itemId')])
            fields.push(['project', text(record, 'projectName') ?? text(record, 'projectId')])
            break
        }
        case 'workspace': {
            fields.push(['name', text(record, 'name')])
            fields.push(['plan', text(record, 'plan')])
            break
        }
        case 'workspace-member': {
            fields.push(['name', text(record, 'fullName')])
            fields.push(['email', text(record, 'userEmail')])
            fields.push(['role', text(record, 'role')])
            fields.push(['workspace', text(record, 'workspaceId')])
            break
        }
        case 'folder': {
            fields.push(['name', text(record, 'name')])
            fields.push(['workspace', text(record, 'workspaceId')])
            break
        }
    }
    return fields.filter((entry): entry is [string, string] => entry[1] !== undefined)
}

export function renderHumanEvent(event: WatchEvent): string {
    const time = new Date(event.detectedAt).toTimeString().slice(0, 8)
    if (event.changeType === 'reset') {
        return [
            `${chalk.dim(time)} ${chalk.yellow.bold('stream reset')}`,
            `  ${chalk.dim('Incremental updates were interrupted; re-read current state.')}`,
        ].join('\n')
    }
    const kind =
        event.changeType === 'deleted' ? chalk.red('deleted') : chalk.green('added or changed')
    const header = `${chalk.dim(time)} ${chalk.cyan.bold(event.resourceType)} ${kind} ${chalk.dim(sanitizeInline(event.resourceId ?? ''))}`
    const lines = [header]
    if (event.data && typeof event.data === 'object' && event.resourceType) {
        for (const [name, value] of describeRecord(
            event.resourceType as WatchResourceName,
            event.data as SyncRecord,
        )) {
            lines.push(`  ${chalk.dim(`${name}:`)} ${value}`)
        }
    }
    return lines.join('\n')
}

async function runWatch(options: WatchOptions): Promise<void> {
    if (isJsonMode()) {
        throw new CliError('INVALID_OPTIONS', 'td watch streams events; --json is not supported.', [
            'Use --ndjson for one JSON event per line.',
        ])
    }
    const resources = parseWatchResources(options.resource ?? [])
    validateWatchFilters(resources, {
        project: Boolean(options.project),
        workspace: Boolean(options.workspace),
        label: Boolean(options.label),
    })

    const api = await getApi()
    const filters: WatchFilterOptions = {}
    if (options.project) filters.projectId = (await resolveProjectRef(api, options.project)).id
    if (options.workspace) filters.workspaceId = (await resolveWorkspaceRef(options.workspace)).id
    if (options.label) filters.label = options.label.replace(/^@/, '')

    const ndjson = options.ndjson === true || isNdjsonMode()
    const status = (message: string) => {
        if (!isQuiet()) process.stderr.write(`${message}\n`)
    }

    let stopSession = () => {}
    const writer = new StreamWriter(process.stdout, () => stopSession())

    const session = new TodoistWatchSession({
        api,
        resources,
        filters,
        onEvent: async (event) => {
            await writer.write(
                ndjson ? `${JSON.stringify(event)}\n` : `${renderHumanEvent(event)}\n\n`,
            )
            if (options.oneEvent) session.stop()
        },
        onStatus: status,
        onReady: () => {
            // Spinners would garble a stream that stays open indefinitely;
            // the gate re-reads this env var on every API call.
            process.env.TD_SPINNER = 'false'
            stopEarlySpinner()
            status(`Watching ${resources.join(', ')} for changes. Press Ctrl-C to stop.`)
        },
    })
    stopSession = () => session.stop()

    const onSignal = () => session.stop()
    process.once('SIGINT', onSignal)
    process.once('SIGTERM', onSignal)
    try {
        await session.start()
    } finally {
        process.off('SIGINT', onSignal)
        process.off('SIGTERM', onSignal)
    }
    // The Todoist websocket server may never complete the close handshake,
    // which would keep the event loop (and the process) alive after a clean
    // shutdown. All event output has been awaited, so exiting here is safe.
    process.exit(0)
}

const WATCH_HELP = `
Streams changes that happen after the command starts — it never dumps current
account contents. State lives only for the lifetime of the process: nothing is
persisted, and changes made while the watcher is stopped are not replayed.

Events describe resulting resource states, not individual user actions:
rapid edits may coalesce into one event, and "changed" covers both creation
and modification (Todoist does not reliably distinguish them). A stream.reset
event means incremental continuation was impossible — re-read current state.
Before acting on an event, re-read the resource for its current state.

With --project/--workspace/--label, a deletion is emitted when the deletion
record still matches or the resource was seen matching earlier in this run; a
filtered deletion can be missed if the resource predates startup and was never
otherwise observed.

Examples:
  Follow work in a project:
    td watch --resource task,comment --project "Website Redesign"

  Wait for the next relevant event (for scripts and agents):
    td watch --resource comment --one-event --ndjson

  Feed a dashboard, notifier, or integration:
    td watch --resource task,project,section --ndjson | my-consumer

  Observe account activity while testing another integration:
    td watch --resource task,comment,notification

NDJSON events (--ndjson) are one JSON object per line with a stable shape:
schemaVersion, eventId, source, accountId, eventType (<resource>.changed,
<resource>.deleted, stream.reset), resourceType, changeType, resourceId,
detectedAt, data. Connection status goes to stderr; stdout stays clean.
`

export function registerWatchCommand(program: Command): void {
    const collect = (value: string, previous: string[]) => [...previous, value]
    program
        .command('watch')
        .description('Stream live changes from your Todoist account')
        .option(
            '--resource <name>',
            'Resource to watch: task, project, section, comment, label, filter, reminder, notification, workspace, workspace-member, folder (repeatable, comma-separated)',
            collect,
            [],
        )
        .option('--project <ref>', 'Only emit changes for this project')
        .option('--workspace <ref>', 'Only emit changes for this workspace')
        .option('--label <name>', 'Only emit tasks with this label (tasks only)')
        .option('--one-event', 'Wait for one matching event, write it, and exit')
        .option('--ndjson', 'Write one JSON event per line')
        .addHelpText('after', WATCH_HELP)
        .action(runWatch)
}
