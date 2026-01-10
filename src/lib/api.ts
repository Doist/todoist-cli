import {
  TodoistApi,
  Task,
  PersonalProject,
  WorkspaceProject,
  Section,
  User,
} from '@doist/todoist-api-typescript'
import { getApiToken } from './auth.js'

let apiClient: TodoistApi | null = null

export async function getApi(): Promise<TodoistApi> {
  if (!apiClient) {
    const token = await getApiToken()
    apiClient = new TodoistApi(token)
  }
  return apiClient
}

export type Project = PersonalProject | WorkspaceProject

export function isWorkspaceProject(
  project: Project
): project is WorkspaceProject {
  return 'workspaceId' in project && project.workspaceId !== undefined
}

export function isPersonalProject(
  project: Project
): project is PersonalProject {
  return !isWorkspaceProject(project)
}

export interface Workspace {
  id: string
  name: string
  role: 'ADMIN' | 'MEMBER' | 'GUEST'
  plan: string
  domainName: string | null
  currentMemberCount: number
  currentActiveProjects: number
  memberCountByType: {
    adminCount: number
    memberCount: number
    guestCount: number
  }
}

export interface WorkspaceFolder {
  id: string
  name: string
  workspaceId: string
}

let workspaceCache: Workspace[] | null = null
let folderCache: WorkspaceFolder[] | null = null
let currentUserIdCache: string | null = null

async function fetchWorkspaceData(): Promise<{
  workspaces: Workspace[]
  folders: WorkspaceFolder[]
}> {
  if (workspaceCache !== null && folderCache !== null) {
    return { workspaces: workspaceCache, folders: folderCache }
  }

  const token = await getApiToken()
  const response = await fetch('https://api.todoist.com/sync/v9/sync', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      sync_token: '*',
      resource_types: '["workspaces","folders"]',
    }),
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch workspace data: ${response.status}`)
  }

  const data = await response.json()
  if (data.error) {
    throw new Error(`Workspace API error: ${data.error}`)
  }

  const workspaces = (data.workspaces ?? []).map(
    (w: Record<string, unknown>) => ({
      id: String(w.id),
      name: w.name,
      role: w.role,
      plan: w.plan,
      domainName: w.domain_name ?? null,
      currentMemberCount: w.current_member_count ?? 0,
      currentActiveProjects: w.current_active_projects ?? 0,
      memberCountByType: {
        adminCount:
          (w.member_count_by_type as Record<string, number>)?.admin_count ?? 0,
        memberCount:
          (w.member_count_by_type as Record<string, number>)?.member_count ?? 0,
        guestCount:
          (w.member_count_by_type as Record<string, number>)?.guest_count ?? 0,
      },
    })
  )

  const folders = (data.folders ?? []).map((f: Record<string, unknown>) => ({
    id: String(f.id),
    name: String(f.name),
    workspaceId: String(f.workspace_id),
  }))

  workspaceCache = workspaces
  folderCache = folders
  return { workspaces, folders }
}

export async function fetchWorkspaces(): Promise<Workspace[]> {
  const { workspaces } = await fetchWorkspaceData()
  return workspaces
}

export async function fetchWorkspaceFolders(): Promise<WorkspaceFolder[]> {
  try {
    const { folders } = await fetchWorkspaceData()
    return folders
  } catch {
    return []
  }
}

export function clearWorkspaceCache(): void {
  workspaceCache = null
  folderCache = null
}

export async function getCurrentUserId(): Promise<string> {
  if (currentUserIdCache) return currentUserIdCache
  const api = await getApi()
  const user = await api.getUser()
  currentUserIdCache = user.id
  return currentUserIdCache
}

export function clearCurrentUserCache(): void {
  currentUserIdCache = null
}

// Reminder types and API (Sync API v1)

export interface ReminderDue {
  date: string
  timezone?: string
  isRecurring?: boolean
  string?: string
  lang?: string
}

export interface Reminder {
  id: string
  itemId: string
  type: 'absolute'
  due?: ReminderDue
  minuteOffset?: number
  isDeleted: boolean
}

interface SyncCommand {
  type: string
  uuid: string
  temp_id?: string
  args: Record<string, unknown>
}

interface SyncResponse {
  sync_status?: Record<string, string | { error_code: number; error: string }>
  temp_id_mapping?: Record<string, string>
  reminders?: Array<Record<string, unknown>>
  error?: string
  error_code?: number
}

async function executeSyncCommand(
  commands: SyncCommand[]
): Promise<SyncResponse> {
  const token = await getApiToken()
  const response = await fetch('https://api.todoist.com/api/v1/sync', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      commands: JSON.stringify(commands),
    }),
  })

  if (!response.ok) {
    throw new Error(`Sync API error: ${response.status}`)
  }

  const data: SyncResponse = await response.json()
  if (data.error) {
    throw new Error(`Sync API error: ${data.error}`)
  }

  for (const cmd of commands) {
    const status = data.sync_status?.[cmd.uuid]
    if (status && typeof status === 'object' && 'error' in status) {
      throw new Error(status.error)
    }
  }

  return data
}

function parseReminder(r: Record<string, unknown>): Reminder {
  return {
    id: String(r.id),
    itemId: String(r.item_id),
    type: 'absolute',
    due: r.due as ReminderDue | undefined,
    minuteOffset: r.minute_offset as number | undefined,
    isDeleted: Boolean(r.is_deleted),
  }
}

export async function fetchReminders(): Promise<Reminder[]> {
  const token = await getApiToken()
  const response = await fetch('https://api.todoist.com/api/v1/sync', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      sync_token: '*',
      resource_types: '["reminders"]',
    }),
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch reminders: ${response.status}`)
  }

  const data: SyncResponse = await response.json()
  if (data.error) {
    throw new Error(`Reminders API error: ${data.error}`)
  }

  return (data.reminders ?? []).map(parseReminder).filter((r) => !r.isDeleted)
}

export async function getTaskReminders(taskId: string): Promise<Reminder[]> {
  const reminders = await fetchReminders()
  return reminders.filter((r) => r.itemId === taskId)
}

function generateUuid(): string {
  return crypto.randomUUID()
}

export interface AddReminderArgs {
  itemId: string
  minuteOffset?: number
  due?: ReminderDue
}

export async function addReminder(args: AddReminderArgs): Promise<string> {
  const tempId = generateUuid()
  const command: SyncCommand = {
    type: 'reminder_add',
    uuid: generateUuid(),
    temp_id: tempId,
    args: {
      item_id: args.itemId,
      type: 'absolute',
      ...(args.minuteOffset !== undefined && {
        minute_offset: args.minuteOffset,
      }),
      ...(args.due && { due: args.due }),
    },
  }

  const result = await executeSyncCommand([command])
  return result.temp_id_mapping?.[tempId] ?? tempId
}

export interface UpdateReminderArgs {
  minuteOffset?: number
  due?: ReminderDue
}

export async function updateReminder(
  id: string,
  args: UpdateReminderArgs
): Promise<void> {
  const command: SyncCommand = {
    type: 'reminder_update',
    uuid: generateUuid(),
    args: {
      id,
      ...(args.minuteOffset !== undefined && {
        minute_offset: args.minuteOffset,
      }),
      ...(args.due && { due: args.due }),
    },
  }

  await executeSyncCommand([command])
}

export async function deleteReminder(id: string): Promise<void> {
  const command: SyncCommand = {
    type: 'reminder_delete',
    uuid: generateUuid(),
    args: { id },
  }

  await executeSyncCommand([command])
}

export type { Task, PersonalProject, WorkspaceProject, Section, User }
