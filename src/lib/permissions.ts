import { getAuthMetadata } from './auth.js'

export const READ_ONLY_ERROR_MESSAGE =
    'This CLI is authenticated in read-only mode (OAuth scope data:read). Re-run `td auth login` without --read-only to enable write operations.'

const KNOWN_SAFE_API_METHODS = new Set([
    'getUser',
    'getTasks',
    'getTask',
    'getProjects',
    'getProject',
    'getLabels',
    'getLabel',
    'getSharedLabels',
    'getSections',
    'getSection',
    'getComments',
    'getComment',
    'getTasksByFilter',
    'sync',
])

export function isMutatingApiMethod(methodName: string): boolean {
    return !KNOWN_SAFE_API_METHODS.has(methodName)
}

export function isMutatingSyncPayload(args: unknown[]): boolean {
    if (args.length === 0) return false
    const [payload] = args

    if (!payload || typeof payload !== 'object') return false

    const commands = (payload as { commands?: unknown }).commands
    return Array.isArray(commands) && commands.length > 0
}

export async function ensureWriteAllowed(): Promise<void> {
    const metadata = await getAuthMetadata()
    if (metadata.authMode === 'read-only') {
        throw new Error(READ_ONLY_ERROR_MESSAGE)
    }
}
