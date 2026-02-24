import type { Label, Task } from '@doist/todoist-api-typescript'
import type { Project, Section } from '../api/core.js'
import type { Filter } from '../api/filters.js'
import type { Workspace, WorkspaceFolder } from '../api/workspaces.js'
import type { CacheDb } from './db.js'
import { CACHE_TABLES } from './migrations.js'
import type {
    CachedUser,
    CoreSyncResource,
    LocalPaginatedResult,
    LocalTaskQuery,
    ProjectCollaboratorRecord,
    WorkspaceUserRecord,
} from './types.js'

const LOCAL_CURSOR_PREFIX = 'local:'

function dateOnly(value: string | undefined | null): string | null {
    if (!value) return null
    return value.split('T')[0]
}

function parseLocalCursor(cursor: string | undefined): number {
    if (!cursor) return 0
    if (cursor.startsWith(LOCAL_CURSOR_PREFIX)) {
        const parsed = Number.parseInt(cursor.slice(LOCAL_CURSOR_PREFIX.length), 10)
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
    }
    const parsed = Number.parseInt(cursor, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function formatLocalCursor(offset: number): string {
    return `${LOCAL_CURSOR_PREFIX}${offset}`
}

function parseData<T>(row: Record<string, unknown>): T {
    const raw = row.data
    if (typeof raw !== 'string') {
        throw new Error('Invalid cached row payload')
    }
    return JSON.parse(raw) as T
}

function toSqlBool(value: boolean | undefined): number {
    return value ? 1 : 0
}

export class SyncRepository {
    constructor(private readonly db: CacheDb) {}

    async getMeta(key: string): Promise<string | null> {
        const row = await this.db.first('SELECT value FROM meta WHERE key = ?', [key])
        if (!row) return null
        return typeof row.value === 'string' ? row.value : String(row.value ?? '')
    }

    async setMeta(key: string, value: string): Promise<void> {
        await this.db.execute(
            `INSERT INTO meta(key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
            [key, value],
        )
    }

    async deleteMeta(key: string): Promise<void> {
        await this.db.execute('DELETE FROM meta WHERE key = ?', [key])
    }

    async getSyncToken(): Promise<string | null> {
        return this.getMeta('sync_token')
    }

    async setSyncToken(token: string): Promise<void> {
        await this.setMeta('sync_token', token)
    }

    async getTokenFingerprint(): Promise<string | null> {
        return this.getMeta('token_fingerprint')
    }

    async setTokenFingerprint(fingerprint: string): Promise<void> {
        await this.setMeta('token_fingerprint', fingerprint)
    }

    async getCurrentUserId(): Promise<string | null> {
        return this.getMeta('current_user_id')
    }

    async setCurrentUserId(userId: string): Promise<void> {
        await this.setMeta('current_user_id', userId)
    }

    async markResourcesDirty(resources: CoreSyncResource[]): Promise<void> {
        for (const resource of resources) {
            await this.db.execute(
                `INSERT INTO sync_state(resource, dirty, last_synced_at)
                 VALUES (?, 1, NULL)
                 ON CONFLICT(resource) DO UPDATE SET dirty = 1`,
                [resource],
            )
        }
    }

    async markResourcesClean(resources: CoreSyncResource[], syncedAt: string): Promise<void> {
        for (const resource of resources) {
            await this.db.execute(
                `INSERT INTO sync_state(resource, dirty, last_synced_at)
                 VALUES (?, 0, ?)
                 ON CONFLICT(resource) DO UPDATE SET dirty = 0, last_synced_at = excluded.last_synced_at`,
                [resource, syncedAt],
            )
        }
    }

    async isAnyResourceDirty(resources: CoreSyncResource[]): Promise<boolean> {
        for (const resource of resources) {
            const row = await this.db.first(
                'SELECT dirty FROM sync_state WHERE resource = ? LIMIT 1',
                [resource],
            )
            const dirty = Number(row?.dirty ?? 1)
            if (dirty > 0) return true
        }
        return false
    }

    async isAnyResourceExpired(
        resources: CoreSyncResource[],
        ttlSeconds: number,
    ): Promise<boolean> {
        const nowMs = Date.now()
        for (const resource of resources) {
            const row = await this.db.first(
                'SELECT last_synced_at FROM sync_state WHERE resource = ? LIMIT 1',
                [resource],
            )
            const lastSyncedAt = typeof row?.last_synced_at === 'string' ? row.last_synced_at : null
            if (!lastSyncedAt) return true
            const syncedMs = Date.parse(lastSyncedAt)
            if (!Number.isFinite(syncedMs)) return true
            if (nowMs - syncedMs > ttlSeconds * 1000) return true
        }
        return false
    }

    async hasSnapshot(resources: CoreSyncResource[]): Promise<boolean> {
        for (const resource of resources) {
            const row = await this.db.first(
                'SELECT last_synced_at FROM sync_state WHERE resource = ? LIMIT 1',
                [resource],
            )
            const lastSyncedAt = typeof row?.last_synced_at === 'string' ? row.last_synced_at : null
            if (!lastSyncedAt) return false
        }
        return true
    }

    async clearAllData(): Promise<void> {
        for (const table of CACHE_TABLES) {
            await this.db.execute(`DELETE FROM ${table}`)
        }
        await this.db.execute('UPDATE sync_state SET dirty = 1, last_synced_at = NULL')
        await this.deleteMeta('sync_token')
        await this.deleteMeta('current_user_id')
        await this.deleteMeta('stale_warning_run_id')
    }

    async upsertTasks(tasks: Task[]): Promise<void> {
        for (const task of tasks) {
            await this.db.execute(
                `INSERT INTO tasks(
                    id, data, content, project_id, section_id, parent_id,
                    priority, due_date, responsible_uid, checked, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    data = excluded.data,
                    content = excluded.content,
                    project_id = excluded.project_id,
                    section_id = excluded.section_id,
                    parent_id = excluded.parent_id,
                    priority = excluded.priority,
                    due_date = excluded.due_date,
                    responsible_uid = excluded.responsible_uid,
                    checked = excluded.checked,
                    updated_at = excluded.updated_at`,
                [
                    task.id,
                    JSON.stringify(task),
                    task.content,
                    task.projectId,
                    task.sectionId,
                    task.parentId,
                    task.priority,
                    dateOnly(task.due?.date),
                    task.responsibleUid ?? null,
                    toSqlBool(task.checked),
                    task.updatedAt ?? null,
                ],
            )
        }
    }

    async deleteTasks(taskIds: string[]): Promise<void> {
        for (const id of taskIds) {
            await this.db.execute('DELETE FROM tasks WHERE id = ?', [id])
        }
    }

    async upsertProjects(projects: Project[]): Promise<void> {
        for (const project of projects) {
            const workspaceId =
                'workspaceId' in project && typeof project.workspaceId === 'string'
                    ? project.workspaceId
                    : null
            const folderId =
                'folderId' in project && project.folderId != null ? String(project.folderId) : null
            const parentId =
                'parentId' in project && typeof project.parentId === 'string'
                    ? project.parentId
                    : null
            await this.db.execute(
                `INSERT INTO projects(
                    id, data, name, workspace_id, folder_id, parent_id, is_shared, is_archived
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    data = excluded.data,
                    name = excluded.name,
                    workspace_id = excluded.workspace_id,
                    folder_id = excluded.folder_id,
                    parent_id = excluded.parent_id,
                    is_shared = excluded.is_shared,
                    is_archived = excluded.is_archived`,
                [
                    project.id,
                    JSON.stringify(project),
                    project.name,
                    workspaceId,
                    folderId,
                    parentId,
                    toSqlBool(project.isShared),
                    toSqlBool(project.isArchived),
                ],
            )
        }
    }

    async deleteProjects(projectIds: string[]): Promise<void> {
        for (const id of projectIds) {
            await this.db.execute('DELETE FROM projects WHERE id = ?', [id])
        }
    }

    async upsertSections(sections: Section[]): Promise<void> {
        for (const section of sections) {
            await this.db.execute(
                `INSERT INTO sections(id, data, name, project_id, section_order)
                 VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET
                    data = excluded.data,
                    name = excluded.name,
                    project_id = excluded.project_id,
                    section_order = excluded.section_order`,
                [
                    section.id,
                    JSON.stringify(section),
                    section.name,
                    section.projectId,
                    section.sectionOrder ?? null,
                ],
            )
        }
    }

    async deleteSections(sectionIds: string[]): Promise<void> {
        for (const id of sectionIds) {
            await this.db.execute('DELETE FROM sections WHERE id = ?', [id])
        }
    }

    async upsertLabels(labels: Label[]): Promise<void> {
        for (const label of labels) {
            await this.db.execute(
                `INSERT INTO labels(id, data, name, color, is_favorite)
                 VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET
                    data = excluded.data,
                    name = excluded.name,
                    color = excluded.color,
                    is_favorite = excluded.is_favorite`,
                [
                    label.id,
                    JSON.stringify(label),
                    label.name,
                    label.color ?? null,
                    toSqlBool(label.isFavorite),
                ],
            )
        }
    }

    async deleteLabels(labelIds: string[]): Promise<void> {
        for (const id of labelIds) {
            await this.db.execute('DELETE FROM labels WHERE id = ?', [id])
        }
    }

    async upsertUsers(users: CachedUser[]): Promise<void> {
        for (const user of users) {
            const fullName = user.fullName ?? user.name ?? null
            await this.db.execute(
                `INSERT INTO users(id, data, full_name, email, inbox_project_id)
                 VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET
                    data = excluded.data,
                    full_name = excluded.full_name,
                    email = excluded.email,
                    inbox_project_id = excluded.inbox_project_id`,
                [
                    user.id,
                    JSON.stringify(user),
                    fullName,
                    user.email ?? null,
                    user.inboxProjectId ?? null,
                ],
            )
        }
    }

    async deleteUsers(userIds: string[]): Promise<void> {
        for (const id of userIds) {
            await this.db.execute('DELETE FROM users WHERE id = ?', [id])
        }
    }

    async upsertFilters(filters: Filter[]): Promise<void> {
        for (const filter of filters) {
            await this.db.execute(
                `INSERT INTO filters(id, data, name, query, is_favorite, is_deleted)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET
                    data = excluded.data,
                    name = excluded.name,
                    query = excluded.query,
                    is_favorite = excluded.is_favorite,
                    is_deleted = excluded.is_deleted`,
                [
                    filter.id,
                    JSON.stringify(filter),
                    filter.name,
                    filter.query,
                    toSqlBool(filter.isFavorite),
                    toSqlBool(filter.isDeleted),
                ],
            )
        }
    }

    async deleteFilters(filterIds: string[]): Promise<void> {
        for (const id of filterIds) {
            await this.db.execute('DELETE FROM filters WHERE id = ?', [id])
        }
    }

    async upsertWorkspaces(workspaces: Workspace[]): Promise<void> {
        for (const workspace of workspaces) {
            await this.db.execute(
                `INSERT INTO workspaces(id, data, name, role, plan)
                 VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET
                    data = excluded.data,
                    name = excluded.name,
                    role = excluded.role,
                    plan = excluded.plan`,
                [
                    workspace.id,
                    JSON.stringify(workspace),
                    workspace.name,
                    workspace.role,
                    workspace.plan,
                ],
            )
        }
    }

    async deleteWorkspaces(workspaceIds: string[]): Promise<void> {
        for (const id of workspaceIds) {
            await this.db.execute('DELETE FROM workspaces WHERE id = ?', [id])
        }
    }

    async upsertFolders(folders: WorkspaceFolder[]): Promise<void> {
        for (const folder of folders) {
            await this.db.execute(
                `INSERT INTO folders(id, data, name, workspace_id)
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET
                    data = excluded.data,
                    name = excluded.name,
                    workspace_id = excluded.workspace_id`,
                [folder.id, JSON.stringify(folder), folder.name, folder.workspaceId],
            )
        }
    }

    async deleteFolders(folderIds: string[]): Promise<void> {
        for (const id of folderIds) {
            await this.db.execute('DELETE FROM folders WHERE id = ?', [id])
        }
    }

    async listProjects(): Promise<Project[]> {
        const rows = await this.db.query('SELECT data FROM projects ORDER BY rowid ASC')
        return rows.map((row) => parseData<Project>(row))
    }

    async getProject(projectId: string): Promise<Project | null> {
        const row = await this.db.first('SELECT data FROM projects WHERE id = ? LIMIT 1', [
            projectId,
        ])
        return row ? parseData<Project>(row) : null
    }

    async listSections(projectId?: string): Promise<Section[]> {
        const rows = projectId
            ? await this.db.query(
                  'SELECT data FROM sections WHERE project_id = ? ORDER BY section_order ASC, rowid ASC',
                  [projectId],
              )
            : await this.db.query('SELECT data FROM sections ORDER BY section_order ASC, rowid ASC')
        return rows.map((row) => parseData<Section>(row))
    }

    async listLabels(): Promise<Label[]> {
        const rows = await this.db.query('SELECT data FROM labels ORDER BY name COLLATE NOCASE ASC')
        return rows.map((row) => parseData<Label>(row))
    }

    async getLabel(labelId: string): Promise<Label | null> {
        const row = await this.db.first('SELECT data FROM labels WHERE id = ? LIMIT 1', [labelId])
        return row ? parseData<Label>(row) : null
    }

    async listUsers(): Promise<CachedUser[]> {
        const rows = await this.db.query('SELECT data FROM users ORDER BY rowid ASC')
        return rows.map((row) => parseData<CachedUser>(row))
    }

    async getUser(userId: string): Promise<CachedUser | null> {
        const row = await this.db.first('SELECT data FROM users WHERE id = ? LIMIT 1', [userId])
        return row ? parseData<CachedUser>(row) : null
    }

    async listFilters(): Promise<Filter[]> {
        const rows = await this.db.query(
            'SELECT data FROM filters WHERE is_deleted = 0 ORDER BY name COLLATE NOCASE ASC',
        )
        return rows.map((row) => parseData<Filter>(row))
    }

    async getFilter(filterId: string): Promise<Filter | null> {
        const row = await this.db.first('SELECT data FROM filters WHERE id = ? LIMIT 1', [filterId])
        return row ? parseData<Filter>(row) : null
    }

    async listWorkspaces(): Promise<Workspace[]> {
        const rows = await this.db.query(
            'SELECT data FROM workspaces ORDER BY name COLLATE NOCASE ASC',
        )
        return rows.map((row) => parseData<Workspace>(row))
    }

    async listFolders(workspaceId?: string): Promise<WorkspaceFolder[]> {
        const rows = workspaceId
            ? await this.db.query(
                  'SELECT data FROM folders WHERE workspace_id = ? ORDER BY name COLLATE NOCASE ASC',
                  [workspaceId],
              )
            : await this.db.query('SELECT data FROM folders ORDER BY name COLLATE NOCASE ASC')
        return rows.map((row) => parseData<WorkspaceFolder>(row))
    }

    async getTask(taskId: string): Promise<Task | null> {
        const row = await this.db.first('SELECT data FROM tasks WHERE id = ? LIMIT 1', [taskId])
        return row ? parseData<Task>(row) : null
    }

    async listTasks(includeCompleted = false): Promise<Task[]> {
        const rows = includeCompleted
            ? await this.db.query('SELECT data FROM tasks ORDER BY rowid ASC')
            : await this.db.query('SELECT data FROM tasks WHERE checked = 0 ORDER BY rowid ASC')
        return rows.map((row) => parseData<Task>(row))
    }

    async queryTasks(options: LocalTaskQuery): Promise<LocalPaginatedResult<Task>> {
        let tasks = await this.listTasks(options.includeCompleted ?? false)

        if (options.projectId) {
            tasks = tasks.filter((task) => task.projectId === options.projectId)
        }

        if (options.parentId !== undefined) {
            tasks = tasks.filter((task) => (task.parentId ?? null) === (options.parentId ?? null))
        }

        if (options.priority !== undefined) {
            tasks = tasks.filter((task) => task.priority === options.priority)
        }

        if (options.due) {
            const today = new Date().toISOString().split('T')[0]
            if (options.due === 'today') {
                tasks = tasks.filter((task) => dateOnly(task.due?.date) === today)
            } else if (options.due === 'overdue') {
                tasks = tasks.filter((task) => {
                    const taskDate = dateOnly(task.due?.date)
                    return Boolean(taskDate && taskDate < today)
                })
            } else {
                tasks = tasks.filter((task) => dateOnly(task.due?.date) === options.due)
            }
        }

        if (options.labels && options.labels.length > 0) {
            const needles = new Set(options.labels.map((label) => label.toLowerCase()))
            tasks = tasks.filter((task) =>
                task.labels.some((label) => needles.has(label.toLowerCase())),
            )
        }

        if (options.assigneeId) {
            tasks = tasks.filter((task) => task.responsibleUid === options.assigneeId)
        }

        if (options.unassigned) {
            tasks = tasks.filter((task) => !task.responsibleUid)
        }

        if (options.workspaceId || options.personal) {
            const rows = await this.db.query('SELECT id, workspace_id FROM projects')
            const projectWorkspace = new Map<string, string | null>()
            for (const row of rows) {
                const id = String(row.id)
                const workspaceId = row.workspace_id == null ? null : String(row.workspace_id)
                projectWorkspace.set(id, workspaceId)
            }
            if (options.workspaceId) {
                tasks = tasks.filter(
                    (task) => projectWorkspace.get(task.projectId) === options.workspaceId,
                )
            } else if (options.personal) {
                tasks = tasks.filter((task) => !projectWorkspace.get(task.projectId))
            }
        }

        const start = parseLocalCursor(options.cursor)
        const end = start + options.limit
        const paged = tasks.slice(start, end)
        const nextCursor = end < tasks.length ? formatLocalCursor(end) : null
        return { results: paged, nextCursor }
    }

    async replaceWorkspaceUsers(workspaceId: string, users: WorkspaceUserRecord[]): Promise<void> {
        await this.db.execute('DELETE FROM workspace_users WHERE workspace_id = ?', [workspaceId])
        const timestamp = new Date().toISOString()
        for (const user of users) {
            await this.db.execute(
                `INSERT INTO workspace_users(workspace_id, user_id, data, name, email, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [workspaceId, user.id, JSON.stringify(user), user.name, user.email, timestamp],
            )
        }
    }

    async getWorkspaceUsers(
        workspaceId: string,
        maxAgeSeconds: number,
    ): Promise<WorkspaceUserRecord[] | null> {
        const rows = await this.db.query(
            'SELECT user_id, name, email, updated_at FROM workspace_users WHERE workspace_id = ? ORDER BY rowid ASC',
            [workspaceId],
        )
        if (rows.length === 0) return null

        const updatedAt = typeof rows[0].updated_at === 'string' ? rows[0].updated_at : null
        if (!updatedAt) return null
        const ageMs = Date.now() - Date.parse(updatedAt)
        if (!Number.isFinite(ageMs) || ageMs > maxAgeSeconds * 1000) {
            return null
        }

        return rows.map((row) => ({
            id: String(row.user_id),
            name: String(row.name),
            email: String(row.email),
        }))
    }

    async replaceProjectCollaborators(
        projectId: string,
        collaborators: ProjectCollaboratorRecord[],
    ): Promise<void> {
        await this.db.execute('DELETE FROM project_collaborators WHERE project_id = ?', [projectId])
        const timestamp = new Date().toISOString()
        for (const collaborator of collaborators) {
            await this.db.execute(
                `INSERT INTO project_collaborators(project_id, user_id, data, name, email, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    projectId,
                    collaborator.id,
                    JSON.stringify(collaborator),
                    collaborator.name,
                    collaborator.email,
                    timestamp,
                ],
            )
        }
    }

    async getProjectCollaborators(
        projectId: string,
        maxAgeSeconds: number,
    ): Promise<ProjectCollaboratorRecord[] | null> {
        const rows = await this.db.query(
            'SELECT user_id, name, email, updated_at FROM project_collaborators WHERE project_id = ? ORDER BY rowid ASC',
            [projectId],
        )
        if (rows.length === 0) return null

        const updatedAt = typeof rows[0].updated_at === 'string' ? rows[0].updated_at : null
        if (!updatedAt) return null
        const ageMs = Date.now() - Date.parse(updatedAt)
        if (!Number.isFinite(ageMs) || ageMs > maxAgeSeconds * 1000) {
            return null
        }

        return rows.map((row) => ({
            id: String(row.user_id),
            name: String(row.name),
            email: String(row.email),
        }))
    }
}
