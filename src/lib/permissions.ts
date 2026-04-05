import { type AuthMetadata, getAuthMetadata } from './auth.js'
import { CliError } from './errors.js'

export const READ_ONLY_ERROR_MESSAGE =
    'This CLI is authenticated in read-only mode (OAuth scope data:read). Re-run `td auth login` without --read-only to enable write operations.'

// Default-deny allowlist: any API method NOT listed here is treated as mutating.
// When adding new read-only SDK methods, add them to this set.
const KNOWN_SAFE_API_METHODS = new Set([
    // User
    'getUser',
    // Tasks
    'getTasks',
    'getTask',
    'getTasksByFilter',
    'getCompletedTasksByCompletionDate',
    // Projects
    'getProjects',
    'getProject',
    'getFullProject',
    'getArchivedProjectsCount',
    'getProjectPermissions',
    'getProjectCollaborators',
    // Labels
    'getLabels',
    'getLabel',
    'getSharedLabels',
    // Sections
    'getSections',
    'getSection',
    // Comments
    'getComments',
    'getComment',
    // Attachments
    'viewAttachment',
    // Activity
    'getActivityLogs',
    // Workspace
    'getWorkspace',
    'getWorkspaceUsers',
    'getWorkspaceActiveProjects',
    'getWorkspaceArchivedProjects',
    // Project insights
    'getProjectActivityStats',
    'getProjectHealth',
    'getProjectHealthContext',
    'getProjectProgress',
    'getWorkspaceInsights',
    // Templates (export is read-only)
    'exportTemplateAsFile',
    'exportTemplateAsUrl',
    // Reminders (REST read)
    'getReminders',
    'getLocationReminders',
    // Sync is handled separately via payload inspection
    'sync',
])

export function isMutatingApiMethod(methodName: string): boolean {
    if (methodName in Object.prototype) return false
    return !KNOWN_SAFE_API_METHODS.has(methodName)
}

export function isMutatingSyncPayload(args: unknown[]): boolean {
    if (args.length === 0) return false
    const [payload] = args
    if (!payload || typeof payload !== 'object') return false
    const commands = (payload as { commands?: unknown }).commands
    return Array.isArray(commands) && commands.length > 0
}

let cachedMetadata: AuthMetadata | null = null

export async function ensureWriteAllowed(): Promise<void> {
    if (!cachedMetadata) {
        cachedMetadata = await getAuthMetadata()
    }
    if (cachedMetadata.authMode === 'read-only') {
        throw new CliError('READ_ONLY', READ_ONLY_ERROR_MESSAGE)
    }
}

export function clearPermissionsCache(): void {
    cachedMetadata = null
}
