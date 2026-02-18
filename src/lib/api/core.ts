import {
    PersonalProject,
    Section,
    Task,
    TodoistApi,
    User,
    WorkspaceProject,
} from '@doist/todoist-api-typescript'
import { getApiToken } from '../auth.js'
import { getProgressTracker } from '../progress.js'
import { withSpinner } from '../spinner.js'

let apiClient: TodoistApi | null = null

// Mapping of API method names to user-friendly spinner messages
const API_SPINNER_MESSAGES: Record<string, { text: string; color?: 'blue' | 'green' | 'yellow' }> =
    {
        getUser: { text: 'Checking authentication...', color: 'blue' },
        getTasks: { text: 'Loading tasks...', color: 'blue' },
        getProjects: { text: 'Loading projects...', color: 'blue' },
        getLabels: { text: 'Loading labels...', color: 'blue' },
        getSharedLabels: { text: 'Loading shared labels...', color: 'blue' },
        getSections: { text: 'Loading sections...', color: 'blue' },
        getComments: { text: 'Loading comments...', color: 'blue' },
        addTask: { text: 'Creating task...', color: 'green' },
        updateTask: { text: 'Updating task...', color: 'yellow' },
        closeTask: { text: 'Completing task...', color: 'green' },
        reopenTask: { text: 'Reopening task...', color: 'yellow' },
        deleteTask: { text: 'Deleting task...', color: 'yellow' },
        addProject: { text: 'Creating project...', color: 'green' },
        updateProject: { text: 'Updating project...', color: 'yellow' },
        deleteProject: { text: 'Deleting project...', color: 'yellow' },
        addLabel: { text: 'Creating label...', color: 'green' },
        updateLabel: { text: 'Updating label...', color: 'yellow' },
        deleteLabel: { text: 'Deleting label...', color: 'yellow' },
        addSection: { text: 'Creating section...', color: 'green' },
        updateSection: { text: 'Updating section...', color: 'yellow' },
        deleteSection: { text: 'Deleting section...', color: 'yellow' },
        quickAddTask: { text: 'Adding task...', color: 'green' },
        getTasksByFilter: { text: 'Loading tasks...', color: 'blue' },
        moveProjectToWorkspace: { text: 'Moving project to workspace...', color: 'yellow' },
        moveProjectToPersonal: { text: 'Moving project to personal...', color: 'yellow' },
    }

function createSpinnerWrappedApi(api: TodoistApi): TodoistApi {
    return new Proxy(api, {
        get(target, property, receiver) {
            const originalMethod = Reflect.get(target, property, receiver)

            // Only wrap methods (functions) and only if they're likely async API calls
            if (typeof originalMethod === 'function' && typeof property === 'string') {
                const spinnerConfig = API_SPINNER_MESSAGES[property]

                if (spinnerConfig) {
                    return <T extends unknown[]>(...args: T) => {
                        const progressTracker = getProgressTracker()

                        // Extract cursor from args for paginated methods
                        let cursor: string | null = null
                        if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
                            const options = args[0] as Record<string, unknown>
                            if ('cursor' in options && typeof options.cursor === 'string') {
                                cursor = options.cursor
                            }
                        }

                        // Emit progress event for API call start
                        if (progressTracker.isEnabled()) {
                            progressTracker.emitApiCall(property, cursor)
                        }

                        const result = originalMethod.apply(target, args)

                        // If the method returns a Promise, wrap it with spinner and progress tracking
                        if (result && typeof result.then === 'function') {
                            const wrappedPromise = result
                                .then((response: unknown) => {
                                    // Emit progress event for successful response
                                    if (progressTracker.isEnabled()) {
                                        analyzeAndEmitApiResponse(progressTracker, response)
                                    }
                                    return response
                                })
                                .catch((error: Error) => {
                                    // Emit progress event for error
                                    if (progressTracker.isEnabled()) {
                                        progressTracker.emitError(
                                            error.name || 'API_ERROR',
                                            error.message,
                                        )
                                    }
                                    throw error
                                })

                            return withSpinner(spinnerConfig, () => wrappedPromise)
                        }

                        return result
                    }
                }
            }

            return originalMethod
        },
    })
}

function analyzeAndEmitApiResponse(
    progressTracker: ReturnType<typeof getProgressTracker>,
    response: unknown,
): void {
    // For paginated responses, extract metadata
    if (response && typeof response === 'object' && response !== null) {
        const resp = response as Record<string, unknown>

        // Check if it's a paginated response with results array
        if ('results' in resp && Array.isArray(resp.results)) {
            progressTracker.emitApiResponse(
                resp.results.length,
                Boolean(resp.nextCursor),
                typeof resp.nextCursor === 'string' ? resp.nextCursor : null,
            )
            return
        }

        // For array responses (legacy or simple lists)
        if (Array.isArray(response)) {
            progressTracker.emitApiResponse(response.length, false, null)
            return
        }
    }

    // For other responses, emit minimal info
    progressTracker.emitApiResponse(1, false, null)
}

export async function getApi(): Promise<TodoistApi> {
    if (!apiClient) {
        const token = await getApiToken()
        const rawApi = new TodoistApi(token)
        apiClient = createSpinnerWrappedApi(rawApi)
    }
    return apiClient
}

export type Project = PersonalProject | WorkspaceProject

export function isWorkspaceProject(project: Project): project is WorkspaceProject {
    return 'workspaceId' in project && project.workspaceId !== undefined
}

export function isPersonalProject(project: Project): project is PersonalProject {
    return !isWorkspaceProject(project)
}

let currentUserIdCache: string | null = null

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

export interface SyncCommand {
    type: string
    uuid: string
    temp_id?: string
    args: Record<string, unknown>
}

export interface SyncResponse {
    sync_status?: Record<string, string | { error_code: number; error: string }>
    temp_id_mapping?: Record<string, string>
    reminders?: Array<Record<string, unknown>>
    user?: Record<string, unknown>
    user_settings?: Record<string, unknown>
    error?: string
    error_code?: number
}

export function generateUuid(): string {
    return crypto.randomUUID()
}

export async function executeSyncCommand(commands: SyncCommand[]): Promise<SyncResponse> {
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

export async function completeTaskForever(taskId: string): Promise<void> {
    const command: SyncCommand = {
        type: 'item_complete',
        uuid: generateUuid(),
        args: { id: taskId },
    }
    await executeSyncCommand([command])
}

export type { Task, PersonalProject, WorkspaceProject, Section, User }
