import { randomUUID } from 'node:crypto'
import { PassThrough, Readable } from 'node:stream'
import {
    type CustomFetch,
    type CustomFetchResponse,
    getDefaultDispatcher,
} from '@doist/todoist-sdk'
import packageJson from '../../package.json' with { type: 'json' }
import { CliError } from './errors.js'

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

// Minimal shape of the `form-data` npm package's FormData class. The SDK
// uses it internally for multipart uploads. Distinct from the global
// WHATWG `FormData`, which has no `getHeaders`/`pipe`. We require `pipe`
// + `on` because the streaming workaround below uses both.
type FormDataPackage = {
    getHeaders: () => Record<string, string>
    pipe: <T extends NodeJS.WritableStream>(destination: T) => T
    on: (event: 'error', listener: (err: Error) => void) => unknown
}

function isFormDataPackageInstance(body: unknown): body is FormDataPackage {
    if (typeof body !== 'object' || body === null) return false
    const candidate = body as Record<string, unknown>
    return (
        typeof candidate.getHeaders === 'function' &&
        typeof candidate.pipe === 'function' &&
        typeof candidate.on === 'function'
    )
}

// Bridge the `form-data` CombinedStream — which undici's native fetch
// doesn't recognize — into a WHATWG ReadableStream it does. Piping
// through a PassThrough keeps the body lazy (no in-process buffering of
// the whole file) and lets undici honor `signal` / cancel the upstream
// stream when the request is aborted. Stream errors (e.g. ENOENT from
// `fs.createReadStream`) propagate to the PassThrough so undici rejects
// the fetch with the original error as its `cause`.
function formDataToWebStream(form: FormDataPackage): ReadableStream<Uint8Array> {
    const pass = new PassThrough()
    form.pipe(pass)
    form.on('error', (err) => pass.destroy(err))
    return Readable.toWeb(pass) as ReadableStream<Uint8Array>
}

// Walk the error/cause chain looking for a Node fs error so local file
// problems (the SDK opens uploads via `fs.createReadStream`) surface as a
// structured `CliError` rather than a generic `INTERNAL_ERROR`.
function mapStreamErrorToCliError(error: unknown): CliError | undefined {
    let current: unknown = error
    const seen = new Set<unknown>()
    while (current instanceof Error && !seen.has(current)) {
        seen.add(current)
        const code = (current as NodeJS.ErrnoException).code
        const path = (current as NodeJS.ErrnoException).path
        const where = path ? `: ${path}` : ''
        if (code === 'ENOENT') {
            return new CliError('FILE_NOT_FOUND', `File not found${where}`)
        }
        if (code === 'EACCES' || code === 'EPERM' || code === 'EISDIR') {
            return new CliError('FILE_READ_ERROR', `Cannot read file${where}`, [current.message])
        }
        current = (current as Error & { cause?: unknown }).cause
    }
    return undefined
}

export function createTrackedFetch(baseFetch: typeof fetch = globalThis.fetch): CustomFetch {
    return async (url, options = {}) => {
        const { timeout: timeoutMs, headers, signal, body, ...rest } = options

        let abortSignal = signal
        if (timeoutMs) {
            const timeoutSignal = AbortSignal.timeout(timeoutMs)
            abortSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
        }

        // Undici's fetch doesn't recognize the `form-data` npm package as
        // a body type — it coerces it to `"[object FormData]"` (17 bytes)
        // and the upload arrives empty. Bridge it to a WHATWG stream so
        // undici streams the real multipart payload. Gated to the native
        // fetch path: test stubs and other custom transports get the body
        // as-is and decide for themselves how to handle it.
        const useNativeFetch = baseFetch === globalThis.fetch
        const needsBodyBridge = useNativeFetch && isFormDataPackageInstance(body)
        const resolvedBody = needsBodyBridge ? formDataToWebStream(body) : body

        const fetchOptions: RequestInit & { duplex?: 'half' } = {
            ...rest,
            body: resolvedBody as BodyInit | null | undefined,
            signal: abortSignal,
            headers: mergeTodoistHeaders(headers),
        }
        // Required by undici when the body is a streaming `ReadableStream`.
        if (needsBodyBridge) fetchOptions.duplex = 'half'
        await attachDispatcherIfNative(baseFetch, fetchOptions)

        try {
            const response = await baseFetch(url, fetchOptions)
            return toCustomFetchResponse(response)
        } catch (error) {
            if (needsBodyBridge) {
                const mapped = mapStreamErrorToCliError(error)
                if (mapped) throw mapped
            }
            throw error
        }
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
