import { randomUUID } from 'node:crypto'
import { type CustomFetch, type CustomFetchResponse, getDefaultTransport } from '@doist/todoist-sdk'
import packageJson from '../../package.json' with { type: 'json' }
import { isHttpLoggingEnabled, withHttpLogging } from './logger.js'

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
        'request-id': randomUUID(),
        'session-id': SESSION_ID,
        'cli-command': normalizedCommandPath ?? 'unknown',
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

/**
 * Picks the fetch for one request, attaching the SDK's proxy dispatcher when
 * we own the request path. Mutates `options` to add the dispatcher, so the
 * fetch and the dispatcher can only ever be chosen together.
 *
 * A caller that supplies its own fetch — test stubs, injected clients — keeps
 * it untouched and gets no dispatcher: a dispatcher means nothing to a stub,
 * and attaching one to a fetch it was not paired with is the failure this
 * function exists to prevent. Passing `globalThis.fetch` explicitly counts as
 * asking for the default path, so callers that captured the global binding
 * before calling us keep proxy support.
 *
 * The dispatcher and its fetch come from `getDefaultTransport()` as a single
 * value and must not be mixed with anything else. The dispatcher decompresses
 * the response body itself, so a fetch from a different undici build decodes
 * it a second time and the request fails mid-stream with `terminated`.
 */
async function resolveRequestFetch(
    fetchImpl: typeof fetch | undefined,
    options: RequestInit,
): Promise<typeof fetch> {
    if (fetchImpl !== undefined && fetchImpl !== globalThis.fetch) return fetchImpl

    const transport = await getDefaultTransport()
    // No transport outside Node (browser, edge): the global fetch is on its own.
    if (transport === undefined) return globalThis.fetch

    // Don't clobber a dispatcher the caller already chose.
    if (!('dispatcher' in options)) {
        // @ts-expect-error - dispatcher is a valid option for Node's fetch but not in the TS types
        options.dispatcher = transport.dispatcher
    }

    // `fetch: undefined` means the global fetch is the correct partner for
    // this dispatcher (Bun, which decompresses natively). It has already been
    // wrapped for logging by `initializeLogger` if verbose is on.
    if (transport.fetch === undefined) return globalThis.fetch

    // undici's fetch and the global fetch are the same call at runtime but
    // carry different (undici vs DOM) types.
    const pairedFetch = transport.fetch as unknown as typeof fetch

    // The global patch in `initializeLogger` cannot see this fetch, so apply
    // the same wrapper here or `--verbose` goes quiet for all API traffic.
    return isHttpLoggingEnabled() ? withHttpLogging(pairedFetch) : pairedFetch
}

function toCustomFetchResponse(response: Response): CustomFetchResponse {
    return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        text: () => response.text(),
        json: () => response.json(),
        arrayBuffer: () => response.arrayBuffer(),
    }
}

export function createTrackedFetch(baseFetch?: typeof fetch): CustomFetch {
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
        const requestFetch = await resolveRequestFetch(baseFetch, fetchOptions)

        const response = await requestFetch(url, fetchOptions)
        return toCustomFetchResponse(response)
    }
}

export async function fetchTodoist(
    url: string | URL,
    options: RequestInit = {},
    fetchImpl?: typeof fetch,
    commandPath?: string,
): Promise<Response> {
    const { headers, ...rest } = options
    const fetchOptions: RequestInit = {
        ...rest,
        headers: mergeTodoistHeaders(headers, commandPath),
    }
    const requestFetch = await resolveRequestFetch(fetchImpl, fetchOptions)
    return requestFetch(url, fetchOptions)
}

export function resetUsageTrackingForTests(): void {
    activeCommandPath = undefined
}
