import type { Label, Task } from '@doist/todoist-api-typescript'
import type { Project, Section } from '../api/core.js'
import type { Filter } from '../api/filters.js'
import type { Workspace, WorkspaceFolder } from '../api/workspaces.js'

export const CORE_SYNC_RESOURCES = [
    'items',
    'projects',
    'sections',
    'labels',
    'users',
    'filters',
    'workspaces',
    'folders',
] as const

export type CoreSyncResource = (typeof CORE_SYNC_RESOURCES)[number]
export type SyncResource = CoreSyncResource | 'workspace_users' | 'project_collaborators'

export interface LocalPaginatedResult<T> {
    results: T[]
    nextCursor: string | null
}

export interface LocalTaskQuery {
    projectId?: string | null
    parentId?: string | null
    priority?: number
    due?: string
    labels?: string[]
    assigneeId?: string
    unassigned?: boolean
    workspaceId?: string
    personal?: boolean
    includeCompleted?: boolean
    limit: number
    cursor?: string
}

export interface WorkspaceUserRecord {
    id: string
    name: string
    email: string
}

export interface ProjectCollaboratorRecord {
    id: string
    name: string
    email: string
}

export interface SyncDeltaPayload {
    sync_token?: string
    full_sync?: boolean
    items?: Array<Record<string, unknown>>
    projects?: Array<Record<string, unknown>>
    sections?: Array<Record<string, unknown>>
    labels?: Array<Record<string, unknown>>
    users?: Array<Record<string, unknown>>
    filters?: Array<Record<string, unknown>>
    workspaces?: Array<Record<string, unknown>>
    folders?: Array<Record<string, unknown>>
    error?: string
}

export interface CachedUser {
    id: string
    email: string
    name?: string
    fullName?: string
    inboxProjectId?: string
}

export type CachedEntity =
    | { resource: 'items'; value: Task }
    | { resource: 'projects'; value: Project }
    | { resource: 'sections'; value: Section }
    | { resource: 'labels'; value: Label }
    | { resource: 'users'; value: CachedUser }
    | { resource: 'filters'; value: Filter }
    | { resource: 'workspaces'; value: Workspace }
    | { resource: 'folders'; value: WorkspaceFolder }
