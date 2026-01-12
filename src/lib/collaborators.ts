import type { TodoistApi } from '@doist/todoist-api-typescript'
import type { Task, Project } from './api.js'
import { isWorkspaceProject, getCurrentUserId } from './api.js'
import { isIdRef, extractId } from './refs.js'
import { formatError } from './output.js'

export interface CollaboratorInfo {
  id: string
  name: string
  email: string
}

export class CollaboratorCache {
  private workspaceUsers = new Map<string, Map<string, CollaboratorInfo>>()
  private projectCollaborators = new Map<
    string,
    Map<string, CollaboratorInfo>
  >()

  async preload(
    api: TodoistApi,
    tasks: Task[],
    projects: Map<string, Project>
  ): Promise<void> {
    const projectsWithAssignees = new Set<string>()
    for (const task of tasks) {
      if (task.responsibleUid) {
        projectsWithAssignees.add(task.projectId)
      }
    }

    if (projectsWithAssignees.size === 0) return

    const workspaceIds = new Set<string>()
    const sharedPersonalProjectIds: string[] = []

    for (const projectId of projectsWithAssignees) {
      const project = projects.get(projectId)
      if (!project) continue

      if (isWorkspaceProject(project)) {
        workspaceIds.add(project.workspaceId)
      } else if (project.isShared) {
        sharedPersonalProjectIds.push(projectId)
      }
    }

    const fetches: Promise<void>[] = []

    for (const workspaceId of workspaceIds) {
      if (!this.workspaceUsers.has(workspaceId)) {
        fetches.push(this.fetchWorkspaceUsers(api, workspaceId))
      }
    }

    for (const projectId of sharedPersonalProjectIds) {
      if (!this.projectCollaborators.has(projectId)) {
        fetches.push(this.fetchProjectCollaborators(api, projectId))
      }
    }

    await Promise.all(fetches)
  }

  private async fetchWorkspaceUsers(
    api: TodoistApi,
    workspaceId: string
  ): Promise<void> {
    const userMap = new Map<string, CollaboratorInfo>()
    let cursor: string | undefined

    const workspaceIdNum = parseInt(workspaceId, 10)
    while (true) {
      const response = await api.getWorkspaceUsers({
        workspaceId: workspaceIdNum,
        cursor,
        limit: 200,
      })

      for (const user of response.workspaceUsers) {
        userMap.set(user.userId, {
          id: user.userId,
          name: user.fullName,
          email: user.userEmail,
        })
      }

      if (!response.hasMore || !response.nextCursor) break
      cursor = response.nextCursor
    }

    this.workspaceUsers.set(workspaceId, userMap)
  }

  private async fetchProjectCollaborators(
    api: TodoistApi,
    projectId: string
  ): Promise<void> {
    const userMap = new Map<string, CollaboratorInfo>()
    let cursor: string | undefined

    while (true) {
      const response = await api.getProjectCollaborators(projectId, { cursor })

      for (const user of response.results) {
        userMap.set(user.id, {
          id: user.id,
          name: user.name,
          email: user.email,
        })
      }

      if (!response.nextCursor) break
      cursor = response.nextCursor
    }

    this.projectCollaborators.set(projectId, userMap)
  }

  getUserName({
    userId,
    projectId,
    projects,
  }: {
    userId: string
    projectId: string
    projects: Map<string, Project>
  }): string | null {
    const project = projects.get(projectId)
    if (!project) return null

    if (isWorkspaceProject(project)) {
      const workspaceMap = this.workspaceUsers.get(project.workspaceId)
      const user = workspaceMap?.get(userId)
      return user?.name ?? null
    }

    const projectMap = this.projectCollaborators.get(projectId)
    const user = projectMap?.get(userId)
    return user?.name ?? null
  }
}

export function formatUserShortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) {
    return parts[0]
  }
  const firstName = parts[0]
  const lastInitial = parts[parts.length - 1][0]
  return `${firstName} ${lastInitial}.`
}

export interface FormatAssigneeOptions {
  userId: string | null
  projectId: string
  projects: Map<string, Project>
  cache: CollaboratorCache
}

export function formatAssignee({
  userId,
  projectId,
  projects,
  cache,
}: FormatAssigneeOptions): string | null {
  if (!userId) return null

  const name = cache.getUserName({ userId, projectId, projects })
  if (name) {
    return `+${formatUserShortName(name)}`
  }
  return `+${userId}`
}

async function fetchCollaboratorsForProject(
  api: TodoistApi,
  project: Project
): Promise<CollaboratorInfo[]> {
  if (isWorkspaceProject(project)) {
    const users: CollaboratorInfo[] = []
    let cursor: string | undefined
    const workspaceIdNum = parseInt(project.workspaceId, 10)

    while (true) {
      const response = await api.getWorkspaceUsers({
        workspaceId: workspaceIdNum,
        cursor,
        limit: 200,
      })

      for (const user of response.workspaceUsers) {
        users.push({
          id: user.userId,
          name: user.fullName,
          email: user.userEmail,
        })
      }

      if (!response.hasMore || !response.nextCursor) break
      cursor = response.nextCursor
    }
    return users
  }

  if (project.isShared) {
    const users: CollaboratorInfo[] = []
    let cursor: string | undefined

    while (true) {
      const response = await api.getProjectCollaborators(project.id, {
        cursor,
      })

      for (const user of response.results) {
        users.push({
          id: user.id,
          name: user.name,
          email: user.email,
        })
      }

      if (!response.nextCursor) break
      cursor = response.nextCursor
    }
    return users
  }

  throw new Error(
    formatError('NOT_SHARED', 'Cannot assign tasks in non-shared projects.')
  )
}

export async function resolveAssigneeId(
  api: TodoistApi,
  ref: string,
  project: Project
): Promise<string> {
  if (ref.toLowerCase() === 'me') {
    return getCurrentUserId()
  }

  if (isIdRef(ref)) {
    return extractId(ref)
  }

  const collaborators = await fetchCollaboratorsForProject(api, project)
  const lower = ref.toLowerCase()

  const exactName = collaborators.find((c) => c.name.toLowerCase() === lower)
  if (exactName) return exactName.id

  const exactEmail = collaborators.find((c) => c.email.toLowerCase() === lower)
  if (exactEmail) return exactEmail.id

  const partialName = collaborators.filter((c) =>
    c.name.toLowerCase().includes(lower)
  )
  if (partialName.length === 1) return partialName[0].id
  if (partialName.length > 1) {
    throw new Error(
      formatError(
        'AMBIGUOUS_ASSIGNEE',
        `Multiple users match "${ref}":`,
        partialName.slice(0, 5).map((c) => `"${c.name}" (id:${c.id})`)
      )
    )
  }

  throw new Error(formatError('ASSIGNEE_NOT_FOUND', `User "${ref}" not found.`))
}
