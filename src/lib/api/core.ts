import {
    createCommand,
    PersonalProject,
    Section,
    Task,
    TodoistApi,
    TodoistRequestError,
    User,
    WorkspaceProject,
    type DueDate,
} from '@doist/todoist-sdk'
import { getApiToken } from '../auth.js'
import { CliError } from '../errors.js'
import { ensureWriteAllowed, isMutatingApiMethod, isMutatingSyncPayload } from '../permissions.js'
import { getProgressTracker } from '../progress.js'
import { withSpinner } from '../spinner.js'

let apiClient: TodoistApi | null = null

// Mapping of API method names to user-friendly spinner messages
const API_SPINNER_MESSAGES: Record<string, { text: string; color?: 'blue' | 'green' | 'yellow' }> =
    {
        getUser: { text: 'Checking authentication...', color: 'blue' },
        getTasks: { text: 'Loading tasks...', color: 'blue' },
        getProjects: { text: 'Loading projects...', color: 'blue' },
        searchProjects: { text: 'Searching projects...', color: 'blue' },
        getArchivedProjects: { text: 'Loading archived projects...', color: 'blue' },
        getLabels: { text: 'Loading labels...', color: 'blue' },
        getSharedLabels: { text: 'Loading shared labels...', color: 'blue' },
        searchLabels: { text: 'Searching labels...', color: 'blue' },
        renameSharedLabel: { text: 'Renaming shared label...', color: 'yellow' },
        removeSharedLabel: { text: 'Removing shared label...', color: 'yellow' },
        getSections: { text: 'Loading sections...', color: 'blue' },
        searchSections: { text: 'Searching sections...', color: 'blue' },
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
        getArchivedProjectsCount: { text: 'Counting archived projects...', color: 'blue' },
        getProjectPermissions: { text: 'Loading permissions...', color: 'blue' },
        getFullProject: { text: 'Loading project...', color: 'blue' },
        joinProject: { text: 'Joining project...', color: 'green' },
        archiveSection: { text: 'Archiving section...', color: 'yellow' },
        unarchiveSection: { text: 'Unarchiving section...', color: 'yellow' },
        sync: { text: 'Syncing...', color: 'blue' },
        viewAttachment: { text: 'Fetching attachment...', color: 'blue' },
        getWorkspace: { text: 'Loading workspace...', color: 'blue' },
        getWorkspaceActiveProjects: { text: 'Loading workspace projects...', color: 'blue' },
        getWorkspaceArchivedProjects: { text: 'Loading archived projects...', color: 'blue' },
        getProjectActivityStats: { text: 'Loading activity stats...', color: 'blue' },
        getProjectHealth: { text: 'Loading project health...', color: 'blue' },
        getProjectHealthContext: { text: 'Loading health context...', color: 'blue' },
        getProjectProgress: { text: 'Loading project progress...', color: 'blue' },
        getWorkspaceInsights: { text: 'Loading workspace insights...', color: 'blue' },
        analyzeProjectHealth: { text: 'Analyzing project health...', color: 'green' },
        exportTemplateAsFile: { text: 'Exporting template...', color: 'blue' },
        exportTemplateAsUrl: { text: 'Exporting template URL...', color: 'blue' },
        createProjectFromTemplate: { text: 'Creating project from template...', color: 'green' },
        importTemplateIntoProject: { text: 'Importing template...', color: 'green' },
        importTemplateFromId: { text: 'Importing template...', color: 'green' },
        getReminders: { text: 'Loading reminders...', color: 'blue' },
        getLocationReminders: { text: 'Loading location reminders...', color: 'blue' },
        // Backups
        getBackups: { text: 'Loading backups...', color: 'blue' },
        downloadBackup: { text: 'Downloading backup...', color: 'blue' },
    }

function createSpinnerWrappedApi(api: TodoistApi): TodoistApi {
    return new Proxy(api, {
        get(target, property, receiver) {
            const originalMethod = Reflect.get(target, property, receiver)

            if (typeof originalMethod !== 'function' || typeof property !== 'string') {
                return originalMethod
            }

            const spinnerConfig = API_SPINNER_MESSAGES[property]
            const needsPermissionCheck = property === 'sync' || isMutatingApiMethod(property)

            if (!spinnerConfig && !needsPermissionCheck) {
                return originalMethod
            }

            return async <T extends unknown[]>(...args: T) => {
                const isMutating =
                    (property === 'sync' && isMutatingSyncPayload(args)) ||
                    (property !== 'sync' && isMutatingApiMethod(property))

                if (isMutating) {
                    await ensureWriteAllowed()
                }

                const progressTracker = getProgressTracker()

                let cursor: string | null = null
                if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
                    const options = args[0] as Record<string, unknown>
                    if ('cursor' in options && typeof options.cursor === 'string') {
                        cursor = options.cursor
                    }
                }

                if (progressTracker.isEnabled()) {
                    progressTracker.emitApiCall(property, cursor)
                }

                const callApi = async () => {
                    const response = await originalMethod.apply(target, args)
                    if (progressTracker.isEnabled()) {
                        analyzeAndEmitApiResponse(progressTracker, response)
                    }
                    return response
                }

                try {
                    if (spinnerConfig) {
                        return await withSpinner(spinnerConfig, callApi)
                    }
                    return await callApi()
                } catch (error) {
                    if (progressTracker.isEnabled()) {
                        progressTracker.emitError(
                            (error as Error).name || 'API_ERROR',
                            (error as Error).message,
                        )
                    }
                    throw wrapApiError(error)
                }
            }
        },
    })
}

function wrapApiError(error: unknown): Error {
    if (error instanceof CliError) return error
    if (error instanceof TodoistRequestError) {
        const status = error.httpStatusCode
        if (status === 401 || status === 403) {
            return new CliError('AUTH_ERROR', error.message, [
                'Check your API token: td auth status',
            ])
        }
        if (status === 404) {
            return new CliError('NOT_FOUND', error.message)
        }
        if (status === 429) {
            return new CliError('RATE_LIMITED', error.message, ['Wait a moment and retry'])
        }
        return new CliError('API_ERROR', error.message)
    }
    return error instanceof Error ? error : new Error(String(error))
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

export function createApiForToken(token: string): TodoistApi {
    const rawApi = new TodoistApi(token)
    return createSpinnerWrappedApi(rawApi)
}

export async function getApi(): Promise<TodoistApi> {
    if (!apiClient) {
        const token = await getApiToken()
        apiClient = createApiForToken(token)
    }
    return apiClient
}

export type Project = PersonalProject | WorkspaceProject

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

export async function completeTaskForever(taskId: string): Promise<void> {
    const api = await getApi()
    await api.sync({
        commands: [
            createCommand('item_complete', {
                id: taskId,
                completedAt: new Date().toISOString(),
            }),
        ],
    })
}

export function buildRescheduleDate(inputDate: string, existingDue: DueDate): string {
    const isInputDateOnly = !inputDate.includes('T')
    if (isInputDateOnly && existingDue.datetime) {
        const timePart = existingDue.datetime.substring(10)
        return inputDate + timePart
    }
    return inputDate
}

export async function rescheduleTask(
    taskId: string,
    newDate: string,
    existingDue: DueDate,
): Promise<void> {
    const api = await getApi()
    const finalDate = buildRescheduleDate(newDate, existingDue)
    await api.sync({
        commands: [
            createCommand('item_update', {
                id: taskId,
                due: {
                    date: finalDate,
                    string: existingDue.isRecurring ? existingDue.string : finalDate,
                    isRecurring: existingDue.isRecurring,
                    timezone: existingDue.timezone ?? undefined,
                    lang: existingDue.lang ?? undefined,
                },
            }),
        ],
    })
}

export function pickDefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
    return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>
}

export type { Task, PersonalProject, WorkspaceProject, Section, User }
