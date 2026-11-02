import { describe, expect, it } from 'vitest'
import { createMockApi, type MockApi } from '../../test-support/mock-api.js'
import type { WatchEvent } from './core.js'
import {
    parseWatchResources,
    TodoistWatchSession,
    validateWatchFilters,
    type WatchFilterOptions,
    type WatchResourceName,
    type WatchWebSocketLike,
} from './todoist.js'

class FakeWebSocket implements WatchWebSocketLike {
    closed = false
    private listeners: Record<string, Array<() => void>> = {
        open: [],
        message: [],
        close: [],
        error: [],
    }

    addEventListener(type: 'open' | 'message' | 'close' | 'error', listener: () => void): void {
        this.listeners[type].push(listener)
    }

    close(): void {
        this.closed = true
    }

    fire(type: 'open' | 'message' | 'close' | 'error'): void {
        for (const listener of this.listeners[type]) listener()
    }
}

const FAST_TIMINGS = {
    debounceMs: 0,
    reconnect: { initialMs: 0, jitter: 0 },
    retry: { initialMs: 0, jitter: 0 },
}

function baselineResponse() {
    return {
        syncToken: 'tok-0',
        fullSync: true,
        user: { id: 'user-1', websocketUrl: 'wss://ws.example/ws' },
    }
}

async function flush(): Promise<void> {
    for (let i = 0; i < 6; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1))
    }
}

interface Harness {
    api: MockApi
    session: TodoistWatchSession
    sockets: FakeWebSocket[]
    events: WatchEvent[]
    statuses: string[]
    done: Promise<void>
}

function startSession(resources: WatchResourceName[], filters: WatchFilterOptions = {}): Harness {
    const api = createMockApi()
    api.sync.mockResolvedValueOnce(baselineResponse())
    const sockets: FakeWebSocket[] = []
    const events: WatchEvent[] = []
    const statuses: string[] = []
    const session = new TodoistWatchSession({
        api,
        resources,
        filters,
        onEvent: (event) => {
            events.push(event)
        },
        onStatus: (message) => {
            statuses.push(message)
        },
        createWebSocket: () => {
            const socket = new FakeWebSocket()
            sockets.push(socket)
            return socket
        },
        timings: FAST_TIMINGS,
    })
    const done = session.start()
    return { api, session, sockets, events, statuses, done }
}

async function stopSession(harness: Harness): Promise<void> {
    harness.session.stop()
    await harness.done
}

function task(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: 'task-1',
        content: 'Buy milk',
        projectId: 'proj-1',
        labels: [],
        checked: false,
        isDeleted: false,
        priority: 1,
        ...overrides,
    }
}

describe('parseWatchResources', () => {
    it('accepts repeated and comma-separated values, deduplicated', () => {
        expect(parseWatchResources(['task,comment', 'task', 'Project'])).toEqual([
            'task',
            'comment',
            'project',
        ])
    })

    it('requires at least one resource and lists valid choices', () => {
        expect(() => parseWatchResources([])).toThrowError(/at least one --resource/i)
        try {
            parseWatchResources([])
        } catch (error) {
            expect((error as { hints?: string[] }).hints?.join(' ')).toContain('workspace-member')
        }
    })

    it('rejects unknown resources and lists valid choices', () => {
        expect(() => parseWatchResources(['task', 'bogus'])).toThrowError(
            /unknown resource "bogus"/i,
        )
        try {
            parseWatchResources(['bogus'])
        } catch (error) {
            expect((error as { hints?: string[] }).hints?.join(' ')).toContain('task, project')
        }
    })
})

describe('validateWatchFilters', () => {
    it('rejects --label when watching anything but tasks', () => {
        expect(() => validateWatchFilters(['task', 'comment'], { label: true })).toThrowError(
            /--label is valid only when watching tasks/,
        )
        expect(() => validateWatchFilters(['task'], { label: true })).not.toThrow()
    })

    it('rejects --project for resources without a project relationship', () => {
        expect(() => validateWatchFilters(['label'], { project: true })).toThrowError(
            /--project cannot filter these resources: label/,
        )
        expect(() =>
            validateWatchFilters(['task', 'comment', 'reminder', 'notification', 'section'], {
                project: true,
            }),
        ).not.toThrow()
    })

    it('rejects --workspace for resources without a workspace relationship', () => {
        expect(() => validateWatchFilters(['filter'], { workspace: true })).toThrowError(
            /--workspace cannot filter these resources: filter/,
        )
        expect(() =>
            validateWatchFilters(['workspace', 'workspace-member', 'folder', 'task'], {
                workspace: true,
            }),
        ).not.toThrow()
    })
})

describe('TodoistWatchSession', () => {
    it('baselines without emitting and emits changes after a server push', async () => {
        const harness = startSession(['task'])
        await flush()

        expect(harness.api.sync).toHaveBeenCalledTimes(1)
        expect(harness.api.sync).toHaveBeenCalledWith({
            syncToken: '*',
            resourceTypes: ['user'],
        })
        expect(harness.events).toHaveLength(0)

        harness.api.sync.mockResolvedValueOnce({
            syncToken: 'tok-1',
            fullSync: false,
            items: [task()],
        })
        harness.sockets[0].fire('open')
        await flush()

        expect(harness.api.sync).toHaveBeenLastCalledWith({
            syncToken: 'tok-0',
            resourceTypes: ['items'],
        })
        expect(harness.events).toHaveLength(1)
        const event = harness.events[0]
        expect(event.schemaVersion).toBe(1)
        expect(event.source).toBe('todoist')
        expect(event.accountId).toBe('user-1')
        expect(event.eventType).toBe('task.changed')
        expect(event.resourceType).toBe('task')
        expect(event.changeType).toBe('changed')
        expect(event.resourceId).toBe('task-1')
        expect(event.data).toMatchObject({ content: 'Buy milk' })

        await stopSession(harness)
    })

    it('requests the sync resource types for all watched resources', async () => {
        const harness = startSession(['task', 'comment'])
        await flush()
        harness.sockets[0].fire('open')
        await flush()

        expect(harness.api.sync).toHaveBeenLastCalledWith({
            syncToken: 'tok-0',
            resourceTypes: ['items', 'notes', 'project_notes'],
        })
        await stopSession(harness)
    })

    it('suppresses duplicate unchanged states but emits later real changes', async () => {
        const harness = startSession(['task'])
        await flush()

        harness.api.sync.mockResolvedValueOnce({
            syncToken: 'tok-1',
            fullSync: false,
            items: [task()],
        })
        harness.sockets[0].fire('open')
        await flush()

        // Server re-delivers the identical state.
        harness.api.sync.mockResolvedValueOnce({
            syncToken: 'tok-2',
            fullSync: false,
            items: [task()],
        })
        harness.sockets[0].fire('message')
        await flush()
        expect(harness.events).toHaveLength(1)

        // A real change to the same resource still produces an event.
        harness.api.sync.mockResolvedValueOnce({
            syncToken: 'tok-3',
            fullSync: false,
            items: [task({ content: 'Buy oat milk' })],
        })
        harness.sockets[0].fire('message')
        await flush()
        expect(harness.events).toHaveLength(2)
        expect(harness.events[1].data).toMatchObject({ content: 'Buy oat milk' })

        await stopSession(harness)
    })

    it('emits deletions on an unfiltered watch', async () => {
        const harness = startSession(['task'])
        await flush()

        harness.api.sync.mockResolvedValueOnce({
            syncToken: 'tok-1',
            fullSync: false,
            items: [task({ isDeleted: true })],
        })
        harness.sockets[0].fire('open')
        await flush()

        expect(harness.events).toHaveLength(1)
        expect(harness.events[0].eventType).toBe('task.deleted')
        expect(harness.events[0].changeType).toBe('deleted')

        await stopSession(harness)
    })

    it('applies project and label filters to tasks', async () => {
        const harness = startSession(['task'], { projectId: 'proj-1', label: 'urgent' })
        await flush()

        harness.api.sync.mockResolvedValueOnce({
            syncToken: 'tok-1',
            fullSync: false,
            items: [
                task({ id: 'match', labels: ['urgent'] }),
                task({ id: 'wrong-project', projectId: 'proj-2', labels: ['urgent'] }),
                task({ id: 'wrong-label', labels: ['later'] }),
            ],
        })
        harness.sockets[0].fire('open')
        await flush()

        expect(harness.events.map((e) => e.resourceId)).toEqual(['match'])
        await stopSession(harness)
    })

    it('resolves comment→task→project lazily, caching the lookup', async () => {
        const harness = startSession(['comment'], { projectId: 'proj-1' })
        await flush()

        harness.api.getTask.mockResolvedValue({ id: 'task-9', projectId: 'proj-1' })
        harness.api.sync.mockResolvedValueOnce({
            syncToken: 'tok-1',
            fullSync: false,
            notes: [
                { id: 'note-1', itemId: 'task-9', content: 'First', isDeleted: false },
                { id: 'note-2', itemId: 'task-9', content: 'Second', isDeleted: false },
            ],
        })
        harness.sockets[0].fire('open')
        await flush()

        expect(harness.events.map((e) => e.resourceId)).toEqual(['note-1', 'note-2'])
        expect(harness.api.getTask).toHaveBeenCalledTimes(1)
        await stopSession(harness)
    })

    it('does not resolve relationships when no filter needs them', async () => {
        const harness = startSession(['comment'])
        await flush()

        harness.api.sync.mockResolvedValueOnce({
            syncToken: 'tok-1',
            fullSync: false,
            notes: [{ id: 'note-1', itemId: 'task-9', content: 'Hello', isDeleted: false }],
        })
        harness.sockets[0].fire('open')
        await flush()

        expect(harness.events).toHaveLength(1)
        expect(harness.api.getTask).not.toHaveBeenCalled()
        await stopSession(harness)
    })

    it('emits filtered deletions for resources previously seen matching', async () => {
        const harness = startSession(['task'], { projectId: 'proj-1' })
        await flush()

        harness.api.sync.mockResolvedValueOnce({
            syncToken: 'tok-1',
            fullSync: false,
            items: [task({ id: 'seen' })],
        })
        harness.sockets[0].fire('open')
        await flush()
        expect(harness.events).toHaveLength(1)

        // Deletion records lack the project field the filter needs. The
        // previously-seen resource is emitted; the never-seen one is not.
        harness.api.sync.mockResolvedValueOnce({
            syncToken: 'tok-2',
            fullSync: false,
            items: [
                { id: 'seen', isDeleted: true },
                { id: 'never-seen', isDeleted: true },
            ],
        })
        harness.sockets[0].fire('message')
        await flush()

        expect(harness.events).toHaveLength(2)
        expect(harness.events[1].eventType).toBe('task.deleted')
        expect(harness.events[1].resourceId).toBe('seen')
        await stopSession(harness)
    })

    it('emits stream.reset when incremental continuation becomes impossible', async () => {
        const harness = startSession(['task'])
        await flush()

        harness.api.sync.mockResolvedValueOnce({
            syncToken: 'tok-9',
            fullSync: true,
            items: [task()],
        })
        harness.sockets[0].fire('open')
        await flush()

        expect(harness.events).toHaveLength(1)
        const reset = harness.events[0]
        expect(reset.eventType).toBe('stream.reset')
        expect(reset.resourceType).toBeNull()
        expect(reset.changeType).toBe('reset')
        expect(reset.resourceId).toBeNull()

        // The stream continues from the re-baselined position.
        harness.api.sync.mockResolvedValueOnce({
            syncToken: 'tok-10',
            fullSync: false,
            items: [task()],
        })
        harness.sockets[0].fire('message')
        await flush()
        expect(harness.api.sync).toHaveBeenLastCalledWith({
            syncToken: 'tok-9',
            resourceTypes: ['items'],
        })
        expect(harness.events).toHaveLength(2)
        expect(harness.events[1].eventType).toBe('task.changed')

        await stopSession(harness)
    })

    it('reconnects after a dropped connection and catches up', async () => {
        const harness = startSession(['task'])
        await flush()
        harness.sockets[0].fire('open')
        await flush()

        harness.sockets[0].fire('close')
        await flush()
        expect(harness.sockets).toHaveLength(2)
        expect(harness.statuses.some((s) => s.includes('retrying'))).toBe(true)

        harness.api.sync.mockResolvedValueOnce({
            syncToken: 'tok-2',
            fullSync: false,
            items: [task({ id: 'missed-while-down' })],
        })
        harness.sockets[1].fire('open')
        await flush()

        expect(harness.statuses.some((s) => s.includes('Reconnected'))).toBe(true)
        expect(harness.events.map((e) => e.resourceId)).toEqual(['missed-while-down'])
        await stopSession(harness)
    })

    it('retries transient sync failures and recovers', async () => {
        const harness = startSession(['task'])
        await flush()

        harness.api.sync.mockRejectedValueOnce(new Error('socket hang up')).mockResolvedValueOnce({
            syncToken: 'tok-1',
            fullSync: false,
            items: [task()],
        })
        harness.sockets[0].fire('open')
        await flush()

        expect(harness.statuses.some((s) => s.includes('Sync failed'))).toBe(true)
        expect(harness.events).toHaveLength(1)
        expect(harness.events[0].eventType).toBe('task.changed')
        await stopSession(harness)
    })
})
