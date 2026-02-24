import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetCacheDbForTests } from '../lib/sync/db.js'
import { ensureFresh, markResourcesDirty } from '../lib/sync/engine.js'

const require = createRequire(import.meta.url)
const hasLibsqlClient = (() => {
    try {
        require.resolve('@libsql/client')
        return true
    } catch {
        return false
    }
})()

const describeIfLibsql = hasLibsqlClient ? describe : describe.skip

function taskRaw(id: string, content: string): Record<string, unknown> {
    return {
        id,
        content,
        description: '',
        project_id: 'proj-1',
        section_id: null,
        parent_id: null,
        labels: [],
        priority: 1,
        checked: 0,
        is_deleted: 0,
        responsible_uid: null,
        due: null,
    }
}

function projectRaw(): Record<string, unknown> {
    return {
        id: 'proj-1',
        name: 'Inbox',
        color: 'grey',
        is_favorite: 0,
        is_shared: 0,
        is_archived: 0,
        parent_id: null,
        view_style: 'list',
    }
}

function syncResponse(overrides: Partial<Record<string, unknown>> = {}): Response {
    const body = {
        sync_token: 'token-1',
        items: [],
        projects: [],
        sections: [],
        labels: [],
        users: [],
        filters: [],
        workspaces: [],
        folders: [],
        ...overrides,
    }
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    })
}

describeIfLibsql('sync engine', () => {
    let tempDir: string
    let originalFetch: typeof fetch

    beforeEach(async () => {
        tempDir = await mkdtemp(join(tmpdir(), 'todoist-cli-sync-'))
        originalFetch = globalThis.fetch

        process.env.TD_SYNC_ENABLE_IN_TESTS = '1'
        process.env.TD_SYNC_DB_PATH = join(tempDir, 'cache.db')
        process.env.TD_SYNC_TTL_SECONDS = '60'
        process.env.TODOIST_API_TOKEN = 'token-a'
        delete process.env.TD_SYNC_DISABLE

        resetCacheDbForTests()
    })

    afterEach(async () => {
        resetCacheDbForTests()
        globalThis.fetch = originalFetch

        delete process.env.TD_SYNC_ENABLE_IN_TESTS
        delete process.env.TD_SYNC_DB_PATH
        delete process.env.TD_SYNC_TTL_SECONDS
        delete process.env.TODOIST_API_TOKEN
        delete process.env.TD_SYNC_DISABLE

        await rm(tempDir, { recursive: true, force: true })
    })

    it('runs initial full sync and stores token/data', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(
            syncResponse({
                sync_token: 'sync-a',
                items: [taskRaw('task-1', 'First task')],
                projects: [projectRaw()],
            }),
        )
        globalThis.fetch = fetchMock as unknown as typeof fetch

        const repo = await ensureFresh(['items', 'projects'])

        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(repo).not.toBeNull()
        expect(await repo?.getSyncToken()).toBe('sync-a')
        expect((await repo?.listTasks())?.map((task) => task.id)).toEqual(['task-1'])
        expect((await repo?.listProjects())?.map((project) => project.id)).toEqual(['proj-1'])
    })

    it('applies incremental upsert + delete deltas', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                syncResponse({
                    sync_token: 'sync-a',
                    items: [taskRaw('task-1', 'Old title'), taskRaw('task-2', 'Remove me')],
                    projects: [projectRaw()],
                }),
            )
            .mockResolvedValueOnce(
                syncResponse({
                    sync_token: 'sync-b',
                    items: [taskRaw('task-1', 'New title'), { id: 'task-2', is_deleted: 1 }],
                }),
            )
        globalThis.fetch = fetchMock as unknown as typeof fetch

        const firstRepo = await ensureFresh(['items'])
        expect(firstRepo).not.toBeNull()

        await markResourcesDirty(['items'])
        const secondRepo = await ensureFresh(['items'])

        expect(fetchMock).toHaveBeenCalledTimes(2)
        const tasks = await secondRepo?.listTasks()
        expect(tasks?.map((task) => `${task.id}:${task.content}`)).toEqual(['task-1:New title'])
        expect(await secondRepo?.getSyncToken()).toBe('sync-b')
    })

    it('forces sync immediately when dirty even before TTL expiry', async () => {
        process.env.TD_SYNC_TTL_SECONDS = '3600'

        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                syncResponse({
                    sync_token: 'sync-a',
                    items: [taskRaw('task-1', 'First')],
                    projects: [projectRaw()],
                }),
            )
            .mockResolvedValueOnce(
                syncResponse({
                    sync_token: 'sync-b',
                    items: [taskRaw('task-1', 'After dirty')],
                }),
            )
        globalThis.fetch = fetchMock as unknown as typeof fetch

        await ensureFresh(['items'])
        await ensureFresh(['items'])
        expect(fetchMock).toHaveBeenCalledTimes(1)

        await markResourcesDirty(['items'])
        const repo = await ensureFresh(['items'])
        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect((await repo?.listTasks())?.[0]?.content).toBe('After dirty')
    })

    it('clears cache when token fingerprint changes and reboots from full sync', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                syncResponse({
                    sync_token: 'sync-a',
                    items: [taskRaw('task-1', 'Token A task')],
                    projects: [projectRaw()],
                }),
            )
            .mockResolvedValueOnce(
                syncResponse({
                    sync_token: 'sync-b',
                    items: [taskRaw('task-2', 'Token B task')],
                    projects: [projectRaw()],
                }),
            )
        globalThis.fetch = fetchMock as unknown as typeof fetch

        await ensureFresh(['items'])
        process.env.TODOIST_API_TOKEN = 'token-b'
        const repo = await ensureFresh(['items'])

        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect((await repo?.listTasks())?.map((task) => task.id)).toEqual(['task-2'])
    })

    it('serves stale cached data on sync failure when snapshot exists', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                syncResponse({
                    sync_token: 'sync-a',
                    items: [taskRaw('task-1', 'Warm cache')],
                    projects: [projectRaw()],
                }),
            )
            .mockResolvedValueOnce(new Response('server error', { status: 500 }))
            .mockResolvedValueOnce(new Response('server error', { status: 500 }))
        globalThis.fetch = fetchMock as unknown as typeof fetch

        await ensureFresh(['items'])
        await markResourcesDirty(['items'])

        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const repo = await ensureFresh(['items'])
        expect((await repo?.listTasks())?.[0]?.content).toBe('Warm cache')

        await ensureFresh(['items'])
        expect(errorSpy).toHaveBeenCalledTimes(1)
        errorSpy.mockRestore()
    })
})
