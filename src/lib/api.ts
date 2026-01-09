import { TodoistApi, Task, PersonalProject, WorkspaceProject, Section } from '@doist/todoist-api-typescript'
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

export type { Task, PersonalProject, WorkspaceProject, Section }
