import { createHash, randomUUID } from 'node:crypto'
import type { Label, Task } from '@doist/todoist-api-typescript'
import type { Project, Section } from '../api/core.js'
import type { Filter } from '../api/filters.js'
import type { Workspace, WorkspaceFolder } from '../api/workspaces.js'
import { getApiToken, getSyncSettings } from '../auth.js'
import { getCacheDb } from './db.js'
import { SyncRepository } from './repository.js'
import {
    type CachedEntity,
    type CachedUser,
    CORE_SYNC_RESOURCES,
    type CoreSyncResource,
    type SyncDeltaPayload,
} from './types.js'

const SYNC_ENDPOINT = 'https://api.todoist.com/api/v1/sync'
const RUN_ID = randomUUID()
const ONE_TIME_WARNING_KEY = 'stale_warning_run_id'
let staleWarningPrinted = false

interface SyncContext {
    repo: SyncRepository
    token: string
    ttlSeconds: number
}

function toResourceList(resources: CoreSyncResource[]): CoreSyncResource[] {
    const source = resources.length > 0 ? resources : [...CORE_SYNC_RESOURCES]
    return [...new Set(source)]
}

function asString(value: unknown, fallback = ''): string {
    if (value == null) return fallback
    return String(value)
}

function asOptionalString(value: unknown): string | null {
    if (value == null) return null
    return String(value)
}

function asNumber(value: unknown, fallback = 0): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
}

function asBool(value: unknown): boolean {
    return value === true || value === 1 || value === '1'
}

function asOptionalBool(value: unknown): boolean | null {
    if (value == null) return null
    return asBool(value)
}

function isDeleted(raw: Record<string, unknown>): boolean {
    return asBool(raw.is_deleted ?? raw.isDeleted)
}

function mapDue(rawDue: unknown): Task['due'] | null {
    if (!rawDue || typeof rawDue !== 'object') return null
    const due = rawDue as Record<string, unknown>
    const date = asOptionalString(due.date)
    if (!date) return null

    const mapped = {
        date,
        string: asString(due.string, date),
        isRecurring: asBool(due.is_recurring ?? due.isRecurring),
    } as NonNullable<Task['due']>
    const timezone = asOptionalString(due.timezone)
    if (timezone) mapped.timezone = timezone
    const lang = asOptionalString(due.lang)
    if (lang) mapped.lang = lang
    return mapped
}

function mapDuration(rawDuration: unknown): Task['duration'] | null {
    if (!rawDuration || typeof rawDuration !== 'object') return null
    const duration = rawDuration as Record<string, unknown>
    const amount = asNumber(duration.amount, 0)
    const unitRaw = asString(duration.unit, 'minute')
    const unit = unitRaw === 'day' ? 'day' : 'minute'
    return {
        amount,
        unit,
    } as Task['duration']
}

function mapDeadline(rawDeadline: unknown): Task['deadline'] | null {
    if (!rawDeadline || typeof rawDeadline !== 'object') return null
    const deadline = rawDeadline as Record<string, unknown>
    const date = asOptionalString(deadline.date)
    if (!date) return null
    return {
        date,
        lang: asOptionalString(deadline.lang) ?? undefined,
    } as Task['deadline']
}

function mapTask(raw: Record<string, unknown>): Task {
    const id = asString(raw.id)
    const task = {
        id,
        content: asString(raw.content),
        description: asString(raw.description),
        projectId: asString(raw.project_id ?? raw.projectId),
        sectionId: asOptionalString(raw.section_id ?? raw.sectionId),
        parentId: asOptionalString(raw.parent_id ?? raw.parentId),
        labels: Array.isArray(raw.labels) ? raw.labels.map((label) => asString(label)) : [],
        priority: asNumber(raw.priority, 1),
        due: mapDue(raw.due),
        deadline: mapDeadline(raw.deadline),
        duration: mapDuration(raw.duration),
        checked: asBool(raw.checked),
        isDeleted: asBool(raw.is_deleted ?? raw.isDeleted),
        responsibleUid: asOptionalString(raw.responsible_uid ?? raw.responsibleUid),
        addedByUid: asOptionalString(raw.added_by_uid ?? raw.addedByUid),
        assignedByUid: asOptionalString(raw.assigned_by_uid ?? raw.assignedByUid),
        isUncompletable: asBool(raw.is_uncompletable ?? raw.isUncompletable),
        userId: asString(raw.user_id ?? raw.userId),
        createdAt: asString(
            raw.created_at ?? raw.createdAt ?? raw.added_at,
            new Date().toISOString(),
        ),
        addedAt: asOptionalString(raw.added_at ?? raw.addedAt),
        updatedAt: asOptionalString(raw.updated_at ?? raw.updatedAt),
        completedAt: asOptionalString(raw.completed_at ?? raw.completedAt),
        syncId: asOptionalString(raw.sync_id ?? raw.syncId),
        order: asNumber(raw.order ?? raw.item_order, 0),
        childOrder: asNumber(raw.child_order ?? raw.childOrder, 0),
        dayOrder: asNumber(raw.day_order ?? raw.dayOrder, 0),
        noteCount: asNumber(raw.note_count ?? raw.noteCount, 0),
        isCollapsed: asBool(raw.is_collapsed ?? raw.isCollapsed ?? raw.collapsed),
        url: asString(raw.url, `https://app.todoist.com/app/task/${id}`),
    } as Task
    return task
}

function mapProject(raw: Record<string, unknown>): Project {
    const id = asString(raw.id)
    const workspaceId = asOptionalString(raw.workspace_id ?? raw.workspaceId)
    const projectBase = {
        id,
        canAssignTasks: asBool(raw.can_assign_tasks ?? raw.canAssignTasks),
        childOrder: asNumber(raw.child_order ?? raw.childOrder, 0),
        name: asString(raw.name),
        color: asString(raw.color, 'charcoal'),
        createdAt: asOptionalString(raw.created_at ?? raw.createdAt),
        updatedAt: asOptionalString(raw.updated_at ?? raw.updatedAt),
        isFavorite: asBool(raw.is_favorite ?? raw.isFavorite),
        isDeleted: asBool(raw.is_deleted ?? raw.isDeleted),
        isFrozen: asBool(raw.is_frozen ?? raw.isFrozen),
        viewStyle: asString(raw.view_style ?? raw.viewStyle, 'list') as Project['viewStyle'],
        defaultOrder: asNumber(raw.default_order ?? raw.defaultOrder, 0),
        description: asString(raw.description),
        isCollapsed: asBool(raw.is_collapsed ?? raw.isCollapsed),
        url: asString(raw.url, `https://app.todoist.com/app/project/${id}`),
        isShared: asBool(raw.is_shared ?? raw.isShared),
        isArchived: asBool(raw.is_archived ?? raw.isArchived),
    }

    if (workspaceId) {
        return {
            ...projectBase,
            collaboratorRoleDefault: asString(
                raw.collaborator_role_default ?? raw.collaboratorRoleDefault,
            ),
            workspaceId,
            folderId: asOptionalString(raw.folder_id ?? raw.folderId),
            isInviteOnly: asOptionalBool(raw.is_invite_only ?? raw.isInviteOnly),
            isLinkSharingEnabled: asBool(raw.is_link_sharing_enabled ?? raw.isLinkSharingEnabled),
            role: asOptionalString(raw.role),
            status: asString(raw.status, 'IN_PROGRESS'),
        } as Project
    }

    return {
        ...projectBase,
        parentId: asOptionalString(raw.parent_id ?? raw.parentId),
        inboxProject: asBool(raw.inbox_project ?? raw.inboxProject),
    } as Project
}

function mapSection(raw: Record<string, unknown>): Section {
    const id = asString(raw.id)
    return {
        id,
        name: asString(raw.name),
        projectId: asString(raw.project_id ?? raw.projectId),
        sectionOrder: asNumber(raw.section_order ?? raw.sectionOrder, 0),
        url: asString(raw.url, `https://app.todoist.com/app/section/${id}`),
    } as Section
}

function mapLabel(raw: Record<string, unknown>): Label {
    return {
        id: asString(raw.id),
        name: asString(raw.name),
        color: asString(raw.color, 'charcoal'),
        isFavorite: asBool(raw.is_favorite ?? raw.isFavorite),
    } as Label
}

function mapUser(raw: Record<string, unknown>): CachedUser {
    return {
        id: asString(raw.id),
        email: asString(raw.email),
        name: asOptionalString(raw.name) ?? undefined,
        fullName: asString(raw.full_name ?? raw.fullName),
        inboxProjectId: asOptionalString(raw.inbox_project_id ?? raw.inboxProjectId) ?? '',
    }
}

function mapFilter(raw: Record<string, unknown>): Filter {
    return {
        id: asString(raw.id),
        name: asString(raw.name),
        query: asString(raw.query),
        color: asOptionalString(raw.color) ?? undefined,
        itemOrder:
            raw.item_order == null && raw.itemOrder == null
                ? undefined
                : asNumber(raw.item_order ?? raw.itemOrder, 0),
        isFavorite: asBool(raw.is_favorite ?? raw.isFavorite),
        isDeleted: asBool(raw.is_deleted ?? raw.isDeleted),
    }
}

function mapWorkspace(raw: Record<string, unknown>): Workspace {
    const memberCountByType = (raw.member_count_by_type ?? raw.memberCountByType) as
        | Record<string, unknown>
        | undefined
    return {
        id: asString(raw.id),
        name: asString(raw.name),
        role: asString(raw.role, 'MEMBER') as Workspace['role'],
        plan: asString(raw.plan, 'STARTER'),
        domainName: asOptionalString(raw.domain_name ?? raw.domainName),
        currentMemberCount: asNumber(raw.current_member_count ?? raw.currentMemberCount, 0),
        currentActiveProjects: asNumber(
            raw.current_active_projects ?? raw.currentActiveProjects,
            0,
        ),
        memberCountByType: {
            adminCount: asNumber(
                memberCountByType?.admin_count ?? memberCountByType?.adminCount,
                0,
            ),
            memberCount: asNumber(
                memberCountByType?.member_count ?? memberCountByType?.memberCount,
                0,
            ),
            guestCount: asNumber(
                memberCountByType?.guest_count ?? memberCountByType?.guestCount,
                0,
            ),
        },
    }
}

function mapFolder(raw: Record<string, unknown>): WorkspaceFolder {
    return {
        id: asString(raw.id),
        name: asString(raw.name),
        workspaceId: asString(raw.workspace_id ?? raw.workspaceId),
    }
}

function splitDelta<T>(
    rows: Array<Record<string, unknown>> | undefined,
    mapper: (row: Record<string, unknown>) => T,
): { upserts: T[]; deletes: string[] } {
    const upserts: T[] = []
    const deletes: string[] = []
    for (const row of rows ?? []) {
        const id = asOptionalString(row.id)
        if (!id) continue
        if (isDeleted(row)) {
            deletes.push(id)
            continue
        }
        upserts.push(mapper(row))
    }
    return { upserts, deletes }
}

async function getRepository(): Promise<SyncRepository | null> {
    if (process.env.VITEST && process.env.TD_SYNC_ENABLE_IN_TESTS !== '1') {
        return null
    }

    const settings = await getSyncSettings()
    if (!settings.enabled) return null
    const db = await getCacheDb()
    if (!db) return null
    return new SyncRepository(db)
}

async function getSyncContext(): Promise<SyncContext | null> {
    if (process.env.VITEST && process.env.TD_SYNC_ENABLE_IN_TESTS !== '1') {
        return null
    }

    const settings = await getSyncSettings()
    if (!settings.enabled) return null

    let token: string
    try {
        token = await getApiToken()
    } catch {
        return null
    }

    const db = await getCacheDb()
    if (!db) return null

    return {
        repo: new SyncRepository(db),
        token,
        ttlSeconds: settings.ttlSeconds,
    }
}

function fingerprintToken(token: string): string {
    return createHash('sha256').update(token).digest('hex')
}

async function ensureFingerprint(repo: SyncRepository, token: string): Promise<void> {
    const nextFingerprint = fingerprintToken(token)
    const existing = await repo.getTokenFingerprint()
    if (!existing) {
        await repo.setTokenFingerprint(nextFingerprint)
        return
    }
    if (existing !== nextFingerprint) {
        await repo.clearAllData()
        await repo.setTokenFingerprint(nextFingerprint)
    }
}

async function fetchSyncDelta(token: string, syncToken: string): Promise<SyncDeltaPayload> {
    const response = await fetch(SYNC_ENDPOINT, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            sync_token: syncToken,
            resource_types: JSON.stringify(CORE_SYNC_RESOURCES),
        }),
    })

    if (!response.ok) {
        throw new Error(`Sync API error: ${response.status}`)
    }

    const data = (await response.json()) as SyncDeltaPayload
    if (data.error) {
        throw new Error(`Sync API error: ${data.error}`)
    }
    return data
}

async function applyDelta(repo: SyncRepository, payload: SyncDeltaPayload): Promise<void> {
    const tasks = splitDelta(payload.items, mapTask)
    if (tasks.upserts.length > 0) await repo.upsertTasks(tasks.upserts)
    if (tasks.deletes.length > 0) await repo.deleteTasks(tasks.deletes)

    const projects = splitDelta(payload.projects, mapProject)
    if (projects.upserts.length > 0) await repo.upsertProjects(projects.upserts)
    if (projects.deletes.length > 0) await repo.deleteProjects(projects.deletes)

    const sections = splitDelta(payload.sections, mapSection)
    if (sections.upserts.length > 0) await repo.upsertSections(sections.upserts)
    if (sections.deletes.length > 0) await repo.deleteSections(sections.deletes)

    const labels = splitDelta(payload.labels, mapLabel)
    if (labels.upserts.length > 0) await repo.upsertLabels(labels.upserts)
    if (labels.deletes.length > 0) await repo.deleteLabels(labels.deletes)

    const users = splitDelta(payload.users, mapUser)
    if (users.upserts.length > 0) await repo.upsertUsers(users.upserts)
    if (users.deletes.length > 0) await repo.deleteUsers(users.deletes)

    const filters = splitDelta(payload.filters, mapFilter)
    if (filters.upserts.length > 0) await repo.upsertFilters(filters.upserts)
    if (filters.deletes.length > 0) await repo.deleteFilters(filters.deletes)

    const workspaces = splitDelta(payload.workspaces, mapWorkspace)
    if (workspaces.upserts.length > 0) await repo.upsertWorkspaces(workspaces.upserts)
    if (workspaces.deletes.length > 0) await repo.deleteWorkspaces(workspaces.deletes)

    const folders = splitDelta(payload.folders, mapFolder)
    if (folders.upserts.length > 0) await repo.upsertFolders(folders.upserts)
    if (folders.deletes.length > 0) await repo.deleteFolders(folders.deletes)
}

async function syncNow(repo: SyncRepository, token: string): Promise<void> {
    const currentToken = (await repo.getSyncToken()) ?? '*'
    const payload = await fetchSyncDelta(token, currentToken)
    await applyDelta(repo, payload)
    if (payload.sync_token) {
        await repo.setSyncToken(payload.sync_token)
    }
    const syncedAt = new Date().toISOString()
    await repo.markResourcesClean([...CORE_SYNC_RESOURCES], syncedAt)
}

async function warnStaleOnce(repo: SyncRepository, error: unknown): Promise<void> {
    if (staleWarningPrinted) return

    const alreadyWarnedForRun = await repo.getMeta(ONE_TIME_WARNING_KEY)
    if (alreadyWarnedForRun === RUN_ID) {
        staleWarningPrinted = true
        return
    }

    const message = error instanceof Error ? error.message : String(error)
    console.error(`Warning: sync failed, using stale cache (${message}).`)
    staleWarningPrinted = true
    await repo.setMeta(ONE_TIME_WARNING_KEY, RUN_ID)
}

export async function ensureFresh(
    requiredResources: CoreSyncResource[],
): Promise<SyncRepository | null> {
    const context = await getSyncContext()
    if (!context) return null

    const { repo, token, ttlSeconds } = context
    const resources = toResourceList(requiredResources)

    await ensureFingerprint(repo, token)

    const hasSnapshot = await repo.hasSnapshot(resources)
    const shouldSync =
        !hasSnapshot ||
        (await repo.isAnyResourceDirty(resources)) ||
        (await repo.isAnyResourceExpired(resources, ttlSeconds))

    if (!shouldSync) {
        return repo
    }

    try {
        await syncNow(repo, token)
        return repo
    } catch (error) {
        if (hasSnapshot) {
            await warnStaleOnce(repo, error)
            return repo
        }
        throw error
    }
}

export async function getRepositoryWithoutSync(): Promise<SyncRepository | null> {
    return getRepository()
}

export async function markResourcesDirty(resources: CoreSyncResource[]): Promise<void> {
    const context = await getSyncContext()
    if (!context) return

    try {
        await context.repo.markResourcesDirty(toResourceList(resources))
    } catch {}
}

export async function upsertCachedEntity(entity: CachedEntity): Promise<void> {
    const context = await getSyncContext()
    if (!context) return

    try {
        switch (entity.resource) {
            case 'items':
                await context.repo.upsertTasks([entity.value])
                break
            case 'projects':
                await context.repo.upsertProjects([entity.value])
                break
            case 'sections':
                await context.repo.upsertSections([entity.value])
                break
            case 'labels':
                await context.repo.upsertLabels([entity.value])
                break
            case 'users':
                await context.repo.upsertUsers([entity.value])
                break
            case 'filters':
                await context.repo.upsertFilters([entity.value])
                break
            case 'workspaces':
                await context.repo.upsertWorkspaces([entity.value])
                break
            case 'folders':
                await context.repo.upsertFolders([entity.value])
                break
        }
    } catch {}
}

export async function setCachedCurrentUserId(userId: string): Promise<void> {
    const context = await getSyncContext()
    if (!context) return
    try {
        await context.repo.setCurrentUserId(userId)
    } catch {}
}

export async function getCachedCurrentUserId(): Promise<string | null> {
    const context = await getSyncContext()
    if (!context) return null
    try {
        return await context.repo.getCurrentUserId()
    } catch {
        return null
    }
}

export async function clearSyncCache(): Promise<void> {
    const db = await getCacheDb({ ignoreEnabled: true })
    if (!db) return
    const repo = new SyncRepository(db)
    await repo.clearAllData()
}
