import {
    PersonalProject,
    Section,
    Task,
    TodoistApi,
    User,
    WorkspaceProject,
} from '@doist/todoist-api-typescript'
import { getApiToken } from '../auth.js'
import { getLogger, verboseFetch } from '../logger.js'
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
                        const logger = getLogger()

                        // Extract cursor and other options from args for logging
                        let cursor: string | null = null
                        let callParams: Record<string, unknown> | null = null
                        if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
                            const options = args[0] as Record<string, unknown>
                            callParams = options
                            if ('cursor' in options && typeof options.cursor === 'string') {
                                cursor = options.cursor
                            }
                        }

                        // Verbose: log API method call
                        logger.info(`api.${property}()`, {
                            ...(cursor && { cursor }),
                        })
                        if (callParams) {
                            // Log param keys + non-content values (redact query/content to protect user data)
                            const safeParams: Record<string, unknown> = {}
                            for (const [k, v] of Object.entries(callParams)) {
                                if (k === 'query' || k === 'content') {
                                    safeParams[k] = `[${String(v).length} chars]`
                                } else {
                                    safeParams[k] = v
                                }
                            }
                            logger.detail(`api.${property}() params`, safeParams)
                        }

                        // Emit progress event for API call start
                        if (progressTracker.isEnabled()) {
                            progressTracker.emitApiCall(property, cursor)
                        }

                        const startTime = performance.now()
                        const result = originalMethod.apply(target, args)

                        // If the method returns a Promise, wrap it with spinner and progress tracking
                        if (result && typeof result.then === 'function') {
                            const wrappedPromise = result
                                .then((response: unknown) => {
                                    const durationMs = Math.round(performance.now() - startTime)

                                    // Verbose: log response summary with timing
                                    const respMeta = extractResponseMeta(response)
                                    logger.info(`api.${property}() response`, {
                                        duration_ms: durationMs,
                                        ...respMeta,
                                    })

                                    // Emit progress event for successful response
                                    if (progressTracker.isEnabled()) {
                                        analyzeAndEmitApiResponse(progressTracker, response)
                                    }
                                    return response
                                })
                                .catch((error: Error) => {
                                    const durationMs = Math.round(performance.now() - startTime)

                                    // Verbose: log error with timing
                                    logger.info(`api.${property}() FAILED`, {
                                        duration_ms: durationMs,
                                        error: error.message,
                                    })

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

/** Extract metadata from SDK response for verbose logging. */
function extractResponseMeta(response: unknown): Record<string, unknown> {
    const meta: Record<string, unknown> = {}
    if (response && typeof response === 'object' && response !== null) {
        const resp = response as Record<string, unknown>
        if ('results' in resp && Array.isArray(resp.results)) {
            meta.result_count = resp.results.length
            meta.has_more = Boolean(resp.nextCursor)
            if (resp.nextCursor) meta.next_cursor = resp.nextCursor
        } else if (Array.isArray(response)) {
            meta.result_count = response.length
        } else if ('id' in resp) {
            meta.id = resp.id
        }
    }
    return meta
}

export async function getApi(): Promise<TodoistApi> {
    if (!apiClient) {
        const logger = getLogger()
        logger.detail('initializing TodoistApi client')
        const token = await getApiToken()
        const rawApi = new TodoistApi(token)
        apiClient = createSpinnerWrappedApi(rawApi)
        logger.detail('TodoistApi client ready')
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
    const logger = getLogger()
    const cmdTypes = commands.map((c) => c.type).join(', ')
    logger.info(`sync POST commands=[${cmdTypes}]`)
    logger.detail('sync command details', {
        command_count: commands.length,
        types: commands.map((c) => c.type),
    })

    const token = await getApiToken()
    const response = await verboseFetch('https://api.todoist.com/api/v1/sync', {
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
        logger.info('sync API error', { error: data.error, error_code: data.error_code })
        throw new Error(`Sync API error: ${data.error}`)
    }

    for (const cmd of commands) {
        const status = data.sync_status?.[cmd.uuid]
        if (status && typeof status === 'object' && 'error' in status) {
            logger.info('sync command error', { type: cmd.type, error: status.error })
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
