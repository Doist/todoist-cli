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
  user?: Record<string, unknown>
  user_settings?: Record<string, unknown>
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

// User Settings types and API (Sync API v1)

export interface UserSettings {
  timezone: string
  timeFormat: number // 0=24h, 1=12h
  dateFormat: number // 0=DD-MM-YYYY, 1=MM-DD-YYYY
  startDay: number // 1-7 (1=Mon, 7=Sun)
  theme: number // 0-10
  autoReminder: number // minutes before due
  nextWeek: number // 1-7
  startPage: string
  reminderPush: boolean
  reminderDesktop: boolean
  reminderEmail: boolean
  completedSoundDesktop: boolean
  completedSoundMobile: boolean
}

export async function fetchUserSettings(): Promise<UserSettings> {
  const token = await getApiToken()
  const response = await fetch('https://api.todoist.com/api/v1/sync', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      sync_token: '*',
      resource_types: '["user","user_settings"]',
    }),
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch user settings: ${response.status}`)
  }

  const data: SyncResponse = await response.json()
  if (data.error) {
    throw new Error(`User settings API error: ${data.error}`)
  }

  const user = data.user ?? {}
  const settings = data.user_settings ?? {}

  return {
    timezone: String(user.timezone ?? 'UTC'),
    timeFormat: Number(user.time_format ?? 0),
    dateFormat: Number(user.date_format ?? 0),
    startDay: Number(user.start_day ?? 1),
    theme: Number(user.theme_id ?? user.theme ?? 0),
    autoReminder: Number(user.auto_reminder ?? 0),
    nextWeek: Number(user.next_week ?? 1),
    startPage: String(user.start_page ?? 'today'),
    reminderPush: Boolean(settings.reminder_push ?? true),
    reminderDesktop: Boolean(settings.reminder_desktop ?? true),
    reminderEmail: Boolean(settings.reminder_email ?? false),
    completedSoundDesktop: Boolean(settings.completed_sound_desktop ?? true),
    completedSoundMobile: Boolean(settings.completed_sound_mobile ?? true),
  }
}

export interface UpdateUserSettingsArgs {
  timezone?: string
  timeFormat?: number
  dateFormat?: number
  startDay?: number
  theme?: number
  autoReminder?: number
  nextWeek?: number
  startPage?: string
  reminderPush?: boolean
  reminderDesktop?: boolean
  reminderEmail?: boolean
  completedSoundDesktop?: boolean
  completedSoundMobile?: boolean
}

export async function updateUserSettings(
  args: UpdateUserSettingsArgs
): Promise<void> {
  const commands: SyncCommand[] = []

  // Build user_update command for general preferences
  const userArgs: Record<string, unknown> = {}
  if (args.timezone !== undefined) userArgs.timezone = args.timezone
  if (args.timeFormat !== undefined) userArgs.time_format = args.timeFormat
  if (args.dateFormat !== undefined) userArgs.date_format = args.dateFormat
  if (args.startDay !== undefined) userArgs.start_day = args.startDay
  if (args.theme !== undefined) userArgs.theme_id = String(args.theme)
  if (args.autoReminder !== undefined)
    userArgs.auto_reminder = args.autoReminder
  if (args.nextWeek !== undefined) userArgs.next_week = args.nextWeek
  if (args.startPage !== undefined) userArgs.start_page = args.startPage

  if (Object.keys(userArgs).length > 0) {
    commands.push({
      type: 'user_update',
      uuid: generateUuid(),
      args: userArgs,
    })
  }

  // Build user_settings_update command for notification preferences
  const settingsArgs: Record<string, unknown> = {}
  if (args.reminderPush !== undefined)
    settingsArgs.reminder_push = args.reminderPush
  if (args.reminderDesktop !== undefined)
    settingsArgs.reminder_desktop = args.reminderDesktop
  if (args.reminderEmail !== undefined)
    settingsArgs.reminder_email = args.reminderEmail
  if (args.completedSoundDesktop !== undefined)
    settingsArgs.completed_sound_desktop = args.completedSoundDesktop
  if (args.completedSoundMobile !== undefined)
    settingsArgs.completed_sound_mobile = args.completedSoundMobile

  if (Object.keys(settingsArgs).length > 0) {
    commands.push({
      type: 'user_settings_update',
      uuid: generateUuid(),
      args: settingsArgs,
    })
  }

  if (commands.length === 0) {
    throw new Error('No settings to update')
  }

  await executeSyncCommand(commands)
}

// File upload types and API (Sync API v9)
//
// NOTE: The @doist/todoist-api-typescript SDK provides an uploadFile() method
// that uses the REST API v1 endpoint (api/v1/uploads). That endpoint returns
// AUTH_INVALID_TOKEN errors with personal API tokens. The Sync API v9 endpoint
// (sync/v9/uploads/add) works correctly with personal API tokens.

export interface UploadResult {
  fileName: string
  fileSize: number
  fileType: string
  fileUrl: string
  resourceType: string
  uploadState: string
}

export async function uploadFile(filePath: string): Promise<UploadResult> {
  const fs = await import('fs')
  const path = await import('path')

  const token = await getApiToken()
  const fileName = path.basename(filePath)
  const fileBuffer = fs.readFileSync(filePath)

  const formData = new FormData()
  formData.append('file_name', fileName)
  formData.append('file', new Blob([fileBuffer]), fileName)

  const response = await fetch('https://api.todoist.com/sync/v9/uploads/add', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  })

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  return {
    fileName: data.file_name,
    fileSize: data.file_size,
    fileType: data.file_type,
    fileUrl: data.file_url,
    resourceType: data.resource_type,
    uploadState: data.upload_state,
  }
}

// Productivity Stats types and API (Sync API v9)

export interface Streak {
  count: number
  start: string
  end: string
}

export interface ProductivityStats {
  karma: number
  karmaTrend: string
  karmaLastUpdate: number
  completedCount: number
  daysItems: Array<{ date: string; totalCompleted: number }>
  weekItems: Array<{ from: string; to: string; totalCompleted: number }>
  goals: {
    dailyGoal: number
    weeklyGoal: number
    currentDailyStreak: Streak
    currentWeeklyStreak: Streak
    maxDailyStreak: Streak
    maxWeeklyStreak: Streak
    vacationMode: boolean
    karmaDisabled: boolean
    ignoreDays: number[]
  }
}

const defaultStreak: Streak = { count: 0, start: '', end: '' }

function parseStreak(s: unknown): Streak {
  if (!s || typeof s !== 'object') return defaultStreak
  const obj = s as Record<string, unknown>
  return {
    count: Number(obj.count ?? 0),
    start: String(obj.start ?? ''),
    end: String(obj.end ?? ''),
  }
}

export async function fetchProductivityStats(): Promise<ProductivityStats> {
  const token = await getApiToken()
  const response = await fetch(
    'https://api.todoist.com/sync/v9/completed/get_stats',
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch productivity stats: ${response.status}`)
  }

  const data = await response.json()
  if (data.error) {
    throw new Error(`Productivity stats API error: ${data.error}`)
  }

  const goals = data.goals ?? {}
  return {
    karma: Number(data.karma ?? 0),
    karmaTrend: String(data.karma_trend ?? 'none'),
    karmaLastUpdate: Number(data.karma_last_update ?? 0),
    completedCount: Number(data.completed_count ?? 0),
    daysItems: (data.days_items ?? []).map(
      (d: { date: string; total_completed: number }) => ({
        date: d.date,
        totalCompleted: d.total_completed,
      })
    ),
    weekItems: (data.week_items ?? []).map(
      (w: { from: string; to: string; total_completed: number }) => ({
        from: w.from,
        to: w.to,
        totalCompleted: w.total_completed,
      })
    ),
    goals: {
      dailyGoal: Number(goals.daily_goal ?? 0),
      weeklyGoal: Number(goals.weekly_goal ?? 0),
      currentDailyStreak: parseStreak(goals.current_daily_streak),
      currentWeeklyStreak: parseStreak(goals.current_weekly_streak),
      maxDailyStreak: parseStreak(goals.max_daily_streak),
      maxWeeklyStreak: parseStreak(goals.max_weekly_streak),
      vacationMode: Boolean(goals.vacation_mode),
      karmaDisabled: Boolean(goals.karma_disabled),
      ignoreDays: (goals.ignore_days ?? []) as number[],
    },
  }
}

export interface UpdateGoalsArgs {
  dailyGoal?: number
  weeklyGoal?: number
  vacationMode?: boolean
  karmaDisabled?: boolean
  ignoreDays?: number[]
}

export async function updateGoals(args: UpdateGoalsArgs): Promise<void> {
  const goalsArgs: Record<string, unknown> = {}
  if (args.dailyGoal !== undefined) goalsArgs.daily_goal = args.dailyGoal
  if (args.weeklyGoal !== undefined) goalsArgs.weekly_goal = args.weeklyGoal
  if (args.vacationMode !== undefined)
    goalsArgs.vacation_mode = args.vacationMode ? 1 : 0
  if (args.karmaDisabled !== undefined)
    goalsArgs.karma_disabled = args.karmaDisabled ? 1 : 0
  if (args.ignoreDays !== undefined) goalsArgs.ignore_days = args.ignoreDays

  if (Object.keys(goalsArgs).length === 0) {
    throw new Error('No goals to update')
  }

  const command: SyncCommand = {
    type: 'update_goals',
    uuid: generateUuid(),
    args: goalsArgs,
  }

  await executeSyncCommand([command])
}

export type { Task, PersonalProject, WorkspaceProject, Section, User }
