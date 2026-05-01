import { randomUUID } from 'node:crypto'
import {
    type CustomFetch,
    type CustomFetchResponse,
    getDefaultDispatcher,
} from '@doist/todoist-sdk'
import packageJson from '../../package.json' with { type: 'json' }

const CLI_NAME = 'todoist-cli'
const CLI_VERSION = packageJson.version
const SESSION_ID = randomUUID()

let activeCommandPath: string | undefined

function getUserAgent(): string {
    return `${CLI_NAME}/${CLI_VERSION}`
}

function getDoistOs(
    platform: NodeJS.Platform = process.platform,
): 'macos' | 'linux' | 'windows' | 'unknown' {
    switch (platform) {
        case 'darwin':
            return 'macos'
        case 'linux':
            return 'linux'
        case 'win32':
            return 'windows'
        default:
            return 'unknown'
    }
}

export function normalizeCommandPath(commandPath: string): string {
    return commandPath
        .replace(/^td\s+/, '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ':')
}

export function setActiveCommandPath(commandPath: string | undefined): void {
    activeCommandPath = commandPath ? normalizeCommandPath(commandPath) : undefined
}

export function getActiveCommandPath(): string | undefined {
    return activeCommandPath
}

export function buildUsageTrackingHeaders(commandPath?: string): Record<string, string> {
    const normalizedCommandPath = commandPath
        ? normalizeCommandPath(commandPath)
        : activeCommandPath

    const headers: Record<string, string> = {
        'User-Agent': getUserAgent(),
        'doist-platform': 'cli',
        'doist-version': CLI_VERSION,
        'doist-os': getDoistOs(),
        'X-TD-Request-Id': randomUUID(),
        'X-TD-Session-Id': SESSION_ID,
        'X-TD-CLI-Command': normalizedCommandPath ?? 'unknown',
    }

    return headers
}

function mergeTodoistHeaders(
    headersInit?: HeadersInit,
    commandPath?: string,
): Record<string, string> {
    const mergedHeaders = new Headers(headersInit)
    for (const [key, value] of Object.entries(buildUsageTrackingHeaders(commandPath))) {
        mergedHeaders.set(key, value)
    }
    return Object.fromEntries(mergedHeaders.entries())
}

async function attachDispatcherIfNative(
    fetchImpl: typeof fetch,
    options: RequestInit,
): Promise<void> {
    // Test stubs pass their own `fetchImpl`; they don't need (or understand)
    // the dispatcher option. Only the real native fetch path needs it for
    // HTTP_PROXY / HTTPS_PROXY / NO_PROXY support.
    if (fetchImpl !== globalThis.fetch) return
    // Don't clobber a dispatcher the caller already chose.
    if ('dispatcher' in options) return
    const dispatcher = await getDefaultDispatcher()
    if (dispatcher !== undefined) {
        // @ts-expect-error - dispatcher is a valid option for Node's fetch but not in the TS types
        options.dispatcher = dispatcher
    }
}

function toCustomFetchResponse(response: Response): CustomFetchResponse {
    return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        text: () => response.text(),
        json: () => response.json(),
    }
}

export function createTrackedFetch(baseFetch: typeof fetch = globalThis.fetch): CustomFetch {
    return async (url, options = {}) => {
        const { timeout: timeoutMs, headers, signal, ...rest } = options

        let abortSignal = signal
        if (timeoutMs) {
            const timeoutSignal = AbortSignal.timeout(timeoutMs)
            abortSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
        }

        const fetchOptions: RequestInit = {
            ...rest,
            signal: abortSignal,
            headers: mergeTodoistHeaders(headers),
        }
        await attachDispatcherIfNative(baseFetch, fetchOptions)

        const response = await baseFetch(url, fetchOptions)
        return toCustomFetchResponse(response)
    }
}

export async function fetchTodoist(
    url: string | URL,
    options: RequestInit = {},
    fetchImpl: typeof fetch = globalThis.fetch,
    commandPath?: string,
): Promise<Response> {
    const { headers, ...rest } = options
    const fetchOptions: RequestInit = {
        ...rest,
        headers: mergeTodoistHeaders(headers, commandPath),
    }
    await attachDispatcherIfNative(fetchImpl, fetchOptions)
    return fetchImpl(url, fetchOptions)
}

export function resetUsageTrackingForTests(): void {
    activeCommandPath = undefined
}
