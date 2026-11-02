/**
 * Todoist-specific half of `td watch`: maps CLI resource names onto Sync API
 * resource types, turns incremental sync responses into watch events, applies
 * project/workspace/label filters, and keeps the stream alive over a
 * websocket with reconnect + catch-up behavior.
 *
 * Product-agnostic machinery (event envelope, dedup, backoff, sanitizing,
 * stream writing) lives in `core.ts`.
 */

import type { SyncResourceType, SyncResponse, TodoistApi } from '@doist/todoist-sdk'
import { CliError } from '../errors.js'
import {
    Backoff,
    type BackoffOptions,
    BoundedMap,
    createWatchEvent,
    sanitizeInline,
    StateDeduper,
    truncateInline,
    type WatchEvent,
} from './core.js'

export const WATCH_SOURCE = 'todoist'

export const WATCH_RESOURCE_NAMES = [
    'task',
    'project',
    'section',
    'comment',
    'label',
    'filter',
    'reminder',
    'notification',
    'workspace',
    'workspace-member',
    'folder',
] as const

export type WatchResourceName = (typeof WATCH_RESOURCE_NAMES)[number]

type SyncRecord = Record<string, unknown>

interface ResourceDef {
    syncTypes: SyncResourceType[]
    collect(response: SyncResponse): SyncRecord[]
    idOf(record: SyncRecord): string
    /** Project the record belongs to, when the record itself says. */
    projectIdOf?(record: SyncRecord): string | undefined
    /** Task to resolve the project through when `projectIdOf` comes up empty. */
    taskIdOf?(record: SyncRecord): string | undefined
    /**
     * Workspace the record belongs to. `null` means "known to have none"
     * (e.g. personal projects); `undefined` means resolve via the project.
     */
    workspaceIdOf?(record: SyncRecord): string | null | undefined
}

function optionalString(record: SyncRecord, key: string): string | undefined {
    const value = record[key]
    return typeof value === 'string' ? value : undefined
}

function asRecords(list: readonly unknown[] | undefined): SyncRecord[] {
    return (list ?? []) as SyncRecord[]
}

const RESOURCE_DEFS: Record<WatchResourceName, ResourceDef> = {
    task: {
        syncTypes: ['items'],
        collect: (r) => asRecords(r.items),
        idOf: (record) => String(record.id),
        projectIdOf: (record) => optionalString(record, 'projectId'),
    },
    project: {
        syncTypes: ['projects'],
        collect: (r) => asRecords(r.projects),
        idOf: (record) => String(record.id),
        projectIdOf: (record) => String(record.id),
        workspaceIdOf: (record) => optionalString(record, 'workspaceId') ?? null,
    },
    section: {
        syncTypes: ['sections'],
        collect: (r) => asRecords(r.sections),
        idOf: (record) => String(record.id),
        projectIdOf: (record) => optionalString(record, 'projectId'),
    },
    comment: {
        syncTypes: ['notes', 'project_notes'],
        collect: (r) => [...asRecords(r.notes), ...asRecords(r.projectNotes)],
        idOf: (record) => String(record.id),
        projectIdOf: (record) => optionalString(record, 'projectId'),
        taskIdOf: (record) => optionalString(record, 'itemId'),
    },
    label: {
        syncTypes: ['labels'],
        collect: (r) => asRecords(r.labels),
        idOf: (record) => String(record.id),
    },
    filter: {
        syncTypes: ['filters'],
        collect: (r) => asRecords(r.filters),
        idOf: (record) => String(record.id),
    },
    reminder: {
        syncTypes: ['reminders', 'reminders_location'],
        collect: (r) => [...asRecords(r.reminders), ...asRecords(r.remindersLocation)],
        idOf: (record) => String(record.id),
        projectIdOf: (record) => optionalString(record, 'projectId'),
        taskIdOf: (record) => optionalString(record, 'itemId'),
    },
    notification: {
        syncTypes: ['live_notifications'],
        collect: (r) => asRecords(r.liveNotifications),
        idOf: (record) => String(record.id),
        projectIdOf: (record) => optionalString(record, 'projectId'),
        taskIdOf: (record) => optionalString(record, 'itemId'),
        // Workspace invitations and similar notifications carry a workspaceId;
        // otherwise fall through to project-based resolution.
        workspaceIdOf: (record) => optionalString(record, 'workspaceId'),
    },
    workspace: {
        syncTypes: ['workspaces'],
        collect: (r) => asRecords(r.workspaces),
        idOf: (record) => String(record.id),
        workspaceIdOf: (record) => String(record.id),
    },
    'workspace-member': {
        syncTypes: ['workspace_users'],
        collect: (r) => asRecords(r.workspaceUsers),
        idOf: (record) => `${record.workspaceId}:${record.userId}`,
        workspaceIdOf: (record) => optionalString(record, 'workspaceId') ?? null,
    },
    folder: {
        syncTypes: ['folders'],
        collect: (r) => asRecords(r.folders),
        idOf: (record) => String(record.id),
        workspaceIdOf: (record) => optionalString(record, 'workspaceId') ?? null,
    },
}

function supportsProjectFilter(name: WatchResourceName): boolean {
    const def = RESOURCE_DEFS[name]
    return Boolean(def.projectIdOf || def.taskIdOf)
}

function supportsWorkspaceFilter(name: WatchResourceName): boolean {
    const def = RESOURCE_DEFS[name]
    return Boolean(def.projectIdOf || def.taskIdOf || def.workspaceIdOf)
}

/**
 * Parse `--resource` values (repeatable and/or comma-separated) into a
 * deduplicated list of valid resource names. Throws a CliError listing the
 * valid choices for missing or unknown values.
 */
export function parseWatchResources(values: string[]): WatchResourceName[] {
    const names = values
        .flatMap((value) => value.split(','))
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0)

    const validList = WATCH_RESOURCE_NAMES.join(', ')
    if (names.length === 0) {
        throw new CliError('INVALID_OPTIONS', 'At least one --resource is required.', [
            `Valid resources: ${validList}`,
            'Example: td watch --resource task,comment',
        ])
    }

    const resources: WatchResourceName[] = []
    for (const name of names) {
        if (!(WATCH_RESOURCE_NAMES as readonly string[]).includes(name)) {
            throw new CliError('INVALID_OPTIONS', `Unknown resource "${sanitizeInline(name)}".`, [
                `Valid resources: ${validList}`,
            ])
        }
        const resource = name as WatchResourceName
        if (!resources.includes(resource)) resources.push(resource)
    }
    return resources
}

export interface WatchFilterOptions {
    projectId?: string
    workspaceId?: string
    label?: string
}

/**
 * Reject filter/resource combinations that could never match: `--label` is
 * task-only, and `--project`/`--workspace` require resources that have that
 * relationship.
 */
export function validateWatchFilters(
    resources: WatchResourceName[],
    filters: { project?: boolean; workspace?: boolean; label?: boolean },
): void {
    if (filters.label) {
        const nonTask = resources.filter((r) => r !== 'task')
        if (nonTask.length > 0) {
            throw new CliError('INVALID_OPTIONS', '--label is valid only when watching tasks.', [
                `Remove --label or drop these resources: ${nonTask.join(', ')}`,
            ])
        }
    }
    if (filters.project) {
        const unsupported = resources.filter((r) => !supportsProjectFilter(r))
        if (unsupported.length > 0) {
            throw new CliError(
                'INVALID_OPTIONS',
                `--project cannot filter these resources: ${unsupported.join(', ')}.`,
                [
                    'Resources with a project relationship: task, project, section, comment, reminder, notification',
                ],
            )
        }
    }
    if (filters.workspace) {
        const unsupported = resources.filter((r) => !supportsWorkspaceFilter(r))
        if (unsupported.length > 0) {
            throw new CliError(
                'INVALID_OPTIONS',
                `--workspace cannot filter these resources: ${unsupported.join(', ')}.`,
                ['Resources without a workspace relationship: label, filter'],
            )
        }
    }
}

/**
 * Lazily resolves task→project and project→workspace relationships when a
 * filter needs them, with bounded per-invocation caches. Records observed on
 * the stream seed the caches so repeated lookups stay off the API.
 */
class RelationResolver {
    private readonly taskProject = new BoundedMap<string, string | null>(2000)
    private readonly projectWorkspace = new BoundedMap<string, string | null>(2000)

    constructor(private readonly api: TodoistApi) {}

    seedTask(taskId: string, projectId: string): void {
        this.taskProject.set(taskId, projectId)
    }

    seedProject(projectId: string, workspaceId: string | null): void {
        this.projectWorkspace.set(projectId, workspaceId)
    }

    async projectOfTask(taskId: string): Promise<string | null> {
        const cached = this.taskProject.get(taskId)
        if (cached !== undefined) return cached
        let projectId: string | null = null
        try {
            const task = await this.api.getTask(taskId)
            projectId = task.projectId ?? null
        } catch {
            // Task may be deleted or inaccessible — treat as unresolvable.
        }
        this.taskProject.set(taskId, projectId)
        return projectId
    }

    async workspaceOfProject(projectId: string): Promise<string | null> {
        const cached = this.projectWorkspace.get(projectId)
        if (cached !== undefined) return cached
        let workspaceId: string | null = null
        try {
            const project = await this.api.getProject(projectId)
            workspaceId = 'workspaceId' in project ? project.workspaceId : null
        } catch {
            // Project may be deleted or inaccessible — treat as unresolvable.
        }
        this.projectWorkspace.set(projectId, workspaceId)
        return workspaceId
    }
}

/** Minimal websocket surface the session needs; injectable for tests. */
export interface WatchWebSocketLike {
    addEventListener(type: 'open' | 'message' | 'close' | 'error', listener: () => void): void
    close(): void
}

export type WatchWebSocketFactory = (url: string) => WatchWebSocketLike

// Node's WebSocket (undici) accepts a non-standard `{ headers }` option that
// @types/node does not yet declare; bridge the gap with a minimal ctor type.
type NodeWebSocketCtor = new (
    url: string,
    options?: { headers?: Record<string, string> },
) => WatchWebSocketLike

/**
 * The Todoist websocket endpoint rejects handshakes without an `Origin`
 * header (any todoist.com origin is accepted); Node's WebSocket sends none by
 * default, so supply the endpoint's own host as origin.
 */
function defaultWebSocketFactory(url: string): WatchWebSocketLike {
    const NodeWebSocket = WebSocket as unknown as NodeWebSocketCtor
    return new NodeWebSocket(url, { headers: { origin: `https://${new URL(url).host}` } })
}

export interface TodoistWatchTimings {
    /** Quiet window that coalesces bursts of websocket notifications. */
    debounceMs?: number
    reconnect?: BackoffOptions
    retry?: BackoffOptions
}

export interface TodoistWatchSessionOptions {
    api: TodoistApi
    resources: WatchResourceName[]
    filters?: WatchFilterOptions
    /** Receives every emitted event. May apply backpressure by returning a promise. */
    onEvent: (event: WatchEvent) => void | Promise<void>
    /** Connection/retry status for stderr. Never receives resource data. */
    onStatus?: (message: string) => void
    /** Called once the baseline position is established and streaming begins. */
    onReady?: () => void
    createWebSocket?: WatchWebSocketFactory
    timings?: TodoistWatchTimings
}

/**
 * A single `td watch` invocation: baselines at the current sync position,
 * listens for server pushes, and emits filtered, deduplicated events until
 * stopped. Holds no state beyond the lifetime of the process.
 */
export class TodoistWatchSession {
    private readonly api: TodoistApi
    private readonly resources: WatchResourceName[]
    private readonly filters: WatchFilterOptions
    private readonly onEvent: (event: WatchEvent) => void | Promise<void>
    private readonly onStatus: (message: string) => void
    private readonly onReady: () => void
    private readonly createWebSocket: WatchWebSocketFactory
    private readonly debounceMs: number
    private readonly reconnectBackoff: Backoff
    private readonly retryBackoff: Backoff
    private readonly syncResourceTypes: SyncResourceType[]
    private readonly deduper = new StateDeduper()
    private readonly relations: RelationResolver
    /** Keys that matched the active filters at least once this invocation. */
    private readonly matchedKeys = new BoundedMap<string, true>(10_000)

    private accountId = ''
    private syncToken = ''
    private websocketUrl = ''
    private ws: WatchWebSocketLike | null = null
    private wasConnected = false
    private everConnected = false
    private stopped = false
    private syncing = false
    private syncPending = false
    private resolveStopped: (() => void) | null = null
    private debounceTimer: NodeJS.Timeout | null = null
    private reconnectTimer: NodeJS.Timeout | null = null
    private retryTimer: NodeJS.Timeout | null = null

    constructor(options: TodoistWatchSessionOptions) {
        this.api = options.api
        this.resources = options.resources
        this.filters = options.filters ?? {}
        this.onEvent = options.onEvent
        this.onStatus = options.onStatus ?? (() => {})
        this.onReady = options.onReady ?? (() => {})
        this.createWebSocket = options.createWebSocket ?? defaultWebSocketFactory
        this.debounceMs = options.timings?.debounceMs ?? 300
        this.reconnectBackoff = new Backoff(options.timings?.reconnect)
        this.retryBackoff = new Backoff(options.timings?.retry)
        this.relations = new RelationResolver(this.api)

        const types = new Set<SyncResourceType>()
        for (const resource of this.resources) {
            for (const type of RESOURCE_DEFS[resource].syncTypes) types.add(type)
        }
        this.syncResourceTypes = [...types]
    }

    /** Baseline at the current position, then stream until `stop()`. */
    async start(): Promise<void> {
        const baseline = await this.api.sync({ syncToken: '*', resourceTypes: ['user'] })
        if (!baseline.syncToken || !baseline.user) {
            throw new CliError('API_ERROR', 'Todoist did not return a usable sync position.')
        }
        this.syncToken = baseline.syncToken
        this.accountId = baseline.user.id
        this.websocketUrl = baseline.user.websocketUrl
        if (!this.websocketUrl) {
            throw new CliError('API_ERROR', 'Todoist did not provide a live-updates endpoint.')
        }

        if (this.stopped) return
        this.onReady()
        this.connect()
        await new Promise<void>((resolve) => {
            this.resolveStopped = resolve
            if (this.stopped) resolve()
        })
        this.cleanup()
    }

    stop(): void {
        if (this.stopped) return
        this.stopped = true
        this.resolveStopped?.()
    }

    private cleanup(): void {
        if (this.debounceTimer) clearTimeout(this.debounceTimer)
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
        if (this.retryTimer) clearTimeout(this.retryTimer)
        try {
            this.ws?.close()
        } catch {
            // Socket may already be closed.
        }
        this.ws = null
    }

    private connect(): void {
        if (this.stopped) return
        let ws: WatchWebSocketLike
        try {
            ws = this.createWebSocket(this.websocketUrl)
        } catch {
            this.scheduleReconnect()
            return
        }
        this.ws = ws
        ws.addEventListener('open', () => {
            if (this.stopped || this.ws !== ws) return
            this.reconnectBackoff.reset()
            if (this.wasConnected) {
                this.onStatus('Reconnected; catching up on missed changes...')
            }
            this.wasConnected = true
            this.everConnected = true
            // Catch up immediately: covers the gap between the baseline sync
            // (or a disconnection) and this socket becoming active.
            this.triggerSync()
        })
        ws.addEventListener('message', () => {
            if (this.stopped || this.ws !== ws) return
            this.scheduleSync()
        })
        const onGone = () => {
            if (this.stopped || this.ws !== ws) return
            this.ws = null
            this.scheduleReconnect()
        }
        ws.addEventListener('close', onGone)
        ws.addEventListener('error', onGone)
    }

    private scheduleReconnect(): void {
        if (this.stopped || this.reconnectTimer) return
        const delay = this.reconnectBackoff.nextDelayMs()
        this.onStatus(
            `${this.everConnected ? 'Connection lost' : 'Could not connect'}; retrying in ${Math.round(delay / 1000)}s...`,
        )
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null
            this.connect()
        }, delay)
    }

    private scheduleSync(): void {
        if (this.stopped || this.debounceTimer) return
        this.debounceTimer = setTimeout(() => {
            this.debounceTimer = null
            this.triggerSync()
        }, this.debounceMs)
    }

    private triggerSync(): void {
        void this.runSync()
    }

    private async runSync(): Promise<void> {
        if (this.stopped) return
        if (this.syncing) {
            this.syncPending = true
            return
        }
        this.syncing = true
        try {
            const response = await this.api.sync({
                syncToken: this.syncToken,
                resourceTypes: this.syncResourceTypes,
            })
            this.retryBackoff.reset()
            if (response.fullSync) {
                // The server could not continue incrementally from our token.
                // Consumers must refresh their own state; we re-baseline and
                // deliberately do not replay the full dump as events.
                if (response.syncToken) this.syncToken = response.syncToken
                await this.emit(
                    createWatchEvent({
                        source: WATCH_SOURCE,
                        accountId: this.accountId,
                        resourceType: null,
                        changeType: 'reset',
                        resourceId: null,
                        data: {
                            reason: 'incremental-sync-unavailable',
                            message:
                                'Todoist could not continue the incremental stream; re-read current state.',
                        },
                    }),
                )
            } else {
                await this.processResponse(response)
                if (response.syncToken) this.syncToken = response.syncToken
            }
        } catch (error) {
            if (this.stopped) return
            const delay = this.retryBackoff.nextDelayMs()
            const message = error instanceof Error ? error.message : String(error)
            this.onStatus(
                `Sync failed (${truncateInline(message, 120)}); retrying in ${Math.round(delay / 1000)}s...`,
            )
            if (!this.retryTimer) {
                this.retryTimer = setTimeout(() => {
                    this.retryTimer = null
                    this.triggerSync()
                }, delay)
            }
        } finally {
            this.syncing = false
            if (this.syncPending && !this.stopped) {
                this.syncPending = false
                this.triggerSync()
            }
        }
    }

    private async processResponse(response: SyncResponse): Promise<void> {
        this.seedRelationCaches(response)
        for (const resource of this.resources) {
            const def = RESOURCE_DEFS[resource]
            for (const record of def.collect(response)) {
                if (this.stopped) return
                const id = def.idOf(record)
                const key = `${resource}:${id}`
                const deleted = record.isDeleted === true
                if (!this.deduper.observe(key, record)) continue
                if (!(await this.shouldEmit(resource, def, key, record, deleted))) continue
                await this.emit(
                    createWatchEvent({
                        source: WATCH_SOURCE,
                        accountId: this.accountId,
                        resourceType: resource,
                        changeType: deleted ? 'deleted' : 'changed',
                        resourceId: id,
                        data: record,
                    }),
                )
            }
        }
    }

    private get filtersActive(): boolean {
        return Boolean(this.filters.projectId || this.filters.workspaceId || this.filters.label)
    }

    private async shouldEmit(
        resource: WatchResourceName,
        def: ResourceDef,
        key: string,
        record: SyncRecord,
        deleted: boolean,
    ): Promise<boolean> {
        if (!this.filtersActive) return true
        if (deleted) {
            // Deletion records can omit the fields a filter needs. Emit when
            // we saw this resource matching earlier in this invocation, or
            // when the record still carries enough data to match now.
            if (this.matchedKeys.has(key)) return true
            return this.matchesFilters(resource, def, record)
        }
        const matches = await this.matchesFilters(resource, def, record)
        if (matches) this.matchedKeys.set(key, true)
        return matches
    }

    private async matchesFilters(
        resource: WatchResourceName,
        def: ResourceDef,
        record: SyncRecord,
    ): Promise<boolean> {
        if (this.filters.label && resource === 'task') {
            const labels = record.labels
            if (!Array.isArray(labels) || !labels.includes(this.filters.label)) return false
        }

        let projectId: string | null | undefined
        const resolveProjectId = async (): Promise<string | null> => {
            if (projectId !== undefined) return projectId
            projectId = def.projectIdOf?.(record) ?? null
            if (projectId === null && def.taskIdOf) {
                const taskId = def.taskIdOf(record)
                if (taskId) projectId = await this.relations.projectOfTask(taskId)
            }
            return projectId
        }

        if (this.filters.projectId) {
            if ((await resolveProjectId()) !== this.filters.projectId) return false
        }

        if (this.filters.workspaceId) {
            let workspaceId = def.workspaceIdOf?.(record)
            if (workspaceId === undefined) {
                const pid = await resolveProjectId()
                workspaceId = pid ? await this.relations.workspaceOfProject(pid) : null
            }
            if (workspaceId !== this.filters.workspaceId) return false
        }

        return true
    }

    /** Records flowing through the stream teach us relationships for free. */
    private seedRelationCaches(response: SyncResponse): void {
        if (!this.filtersActive) return
        for (const record of asRecords(response.items)) {
            const taskId = optionalString(record, 'id')
            const projectId = optionalString(record, 'projectId')
            if (taskId && projectId && record.isDeleted !== true) {
                this.relations.seedTask(taskId, projectId)
            }
        }
        for (const record of asRecords(response.projects)) {
            const projectId = optionalString(record, 'id')
            if (projectId && record.isDeleted !== true) {
                this.relations.seedProject(projectId, optionalString(record, 'workspaceId') ?? null)
            }
        }
    }

    private async emit(event: WatchEvent): Promise<void> {
        if (this.stopped) return
        await this.onEvent(event)
    }
}
