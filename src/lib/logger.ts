/**
 * Verbose logging module for debugging API latency and CLI behavior.
 *
 * Verbosity levels (stackable -v flags):
 *   -v     (1) INFO    : commands invoked, API endpoints hit, response status + total timing
 *   -vv    (2) DETAIL  : request parameters, response metadata, pagination progress
 *   -vvv   (3) DEBUG   : reference resolution steps, HTTP headers, rate-limit info
 *   -vvvv  (4) TRACE   : full request/response headers, body sizes, connection details
 *
 * All output goes to stderr with prefixed tags so it never pollutes stdout data.
 * Can also be activated via TD_VERBOSE=1..4 environment variable.
 */

export const Verbosity = {
    SILENT: 0,
    INFO: 1,
    DETAIL: 2,
    DEBUG: 3,
    TRACE: 4,
} as const

export type Verbosity = (typeof Verbosity)[keyof typeof Verbosity]

const LEVEL_TAG: Record<number, string> = {
    [Verbosity.INFO]: 'info',
    [Verbosity.DETAIL]: 'detail',
    [Verbosity.DEBUG]: 'debug',
    [Verbosity.TRACE]: 'trace',
}

class Logger {
    private level: Verbosity = Verbosity.SILENT

    /** Set verbosity from parsed CLI flags or environment. */
    initialize(): void {
        // Environment variable takes precedence if set
        const envLevel = process.env.TD_VERBOSE
        if (envLevel) {
            const parsed = parseInt(envLevel, 10)
            if (parsed >= Verbosity.INFO && parsed <= Verbosity.TRACE) {
                this.level = parsed as Verbosity
            }
        }

        // Count -v flags in argv (supports -v, -vv, -vvv, -vvvv, and repeated --verbose)
        const args = process.argv.slice(2)
        let cliLevel = 0
        for (const arg of args) {
            if (arg === '--verbose') {
                cliLevel += 1
            } else if (/^-v+$/.test(arg)) {
                // -v = 1, -vv = 2, -vvv = 3, -vvvv = 4
                cliLevel += arg.length - 1
            }
        }

        // CLI flags override env var if higher
        if (cliLevel > 0) {
            this.level = Math.min(cliLevel, Verbosity.TRACE) as Verbosity
        }

        if (this.level >= Verbosity.INFO) {
            this.log(Verbosity.INFO, `verbose logging enabled (level=${this.level})`)
        }
    }

    getLevel(): Verbosity {
        return this.level
    }

    isEnabled(level: Verbosity = Verbosity.INFO): boolean {
        return this.level >= level
    }

    /** Core log method. Only emits if current verbosity >= requested level. */
    log(level: Verbosity, message: string, data?: Record<string, unknown>): void {
        if (this.level < level) return

        const tag = LEVEL_TAG[level] ?? 'log'
        const ts = new Date().toISOString()
        let line = `[td:${tag}] ${ts} ${message}`

        if (data && Object.keys(data).length > 0) {
            const parts: string[] = []
            for (const [key, value] of Object.entries(data)) {
                if (value === undefined || value === null) continue
                parts.push(`${key}=${typeof value === 'object' ? JSON.stringify(value) : value}`)
            }
            if (parts.length > 0) {
                line += ` | ${parts.join(' ')}`
            }
        }

        process.stderr.write(`${line}\n`)
    }

    /** Level-specific convenience methods. */
    info(message: string, data?: Record<string, unknown>): void {
        this.log(Verbosity.INFO, message, data)
    }

    detail(message: string, data?: Record<string, unknown>): void {
        this.log(Verbosity.DETAIL, message, data)
    }

    debug(message: string, data?: Record<string, unknown>): void {
        this.log(Verbosity.DEBUG, message, data)
    }

    trace(message: string, data?: Record<string, unknown>): void {
        this.log(Verbosity.TRACE, message, data)
    }

    /** Log timing of an async operation. Returns the operation result. */
    async timed<T>(
        level: Verbosity,
        label: string,
        operation: () => Promise<T>,
        extraData?: Record<string, unknown>,
    ): Promise<T> {
        if (this.level < level) {
            return operation()
        }

        const start = performance.now()
        this.log(level, `${label} ...started`, extraData)

        try {
            const result = await operation()
            const durationMs = performance.now() - start
            this.log(level, `${label} ...done`, {
                ...extraData,
                duration_ms: Math.round(durationMs),
            })
            return result
        } catch (error) {
            const durationMs = performance.now() - start
            this.log(level, `${label} ...FAILED`, {
                ...extraData,
                duration_ms: Math.round(durationMs),
                error: error instanceof Error ? error.message : String(error),
            })
            throw error
        }
    }
}

// Global singleton
let logger: Logger | null = null

export function getLogger(): Logger {
    if (!logger) {
        logger = new Logger()
    }
    return logger
}

export function initializeLogger(): void {
    const log = getLogger()
    log.initialize()

    // When verbose, patch globalThis.fetch so SDK-internal HTTP calls are also logged.
    // This is the only way to get HTTP-level visibility for @doist/todoist-api-typescript
    // since it uses fetch() internally and doesn't expose hooks.
    if (log.isEnabled()) {
        patchGlobalFetch()
    }
}

/** Save original fetch and replace with logging wrapper. */
function patchGlobalFetch(): void {
    const originalFetch = globalThis.fetch

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const log = getLogger()
        const urlStr =
            typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
        const method =
            init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')
        const urlObj = new URL(urlStr)

        log.info(`fetch ${method} ${urlObj.pathname}`)
        log.detail(`fetch ${method} ${urlStr}`)

        // Log request body size at DETAIL
        if (init?.body) {
            const bodyStr =
                typeof init.body === 'string'
                    ? init.body
                    : init.body instanceof URLSearchParams
                      ? init.body.toString()
                      : null
            if (bodyStr) {
                log.detail('request body', { size_bytes: bodyStr.length })
                if (init.body instanceof URLSearchParams) {
                    log.trace('request body keys', { keys: Array.from(init.body.keys()) })
                }
            }
        }

        // Log request headers at TRACE (redact Authorization)
        if (log.isEnabled(Verbosity.TRACE) && init?.headers) {
            const hdrs: Record<string, string> = {}
            if (init.headers instanceof Headers) {
                init.headers.forEach((v, k) => {
                    hdrs[k] = k.toLowerCase() === 'authorization' ? '[REDACTED]' : v
                })
            } else if (typeof init.headers === 'object') {
                for (const [k, v] of Object.entries(init.headers)) {
                    hdrs[k] = k.toLowerCase() === 'authorization' ? '[REDACTED]' : String(v)
                }
            }
            log.trace('request headers', hdrs)
        }

        const startTime = performance.now()
        const response = await originalFetch(input, init)
        const durationMs = Math.round(performance.now() - startTime)

        // INFO: status + timing
        log.info(`fetch ${method} ${urlObj.pathname} => ${response.status}`, {
            duration_ms: durationMs,
        })

        // DETAIL: content-length
        const contentLength = response.headers.get('content-length')
        if (contentLength) {
            log.detail('response', { content_length: contentLength })
        }

        // DEBUG: rate-limit and diagnostic headers
        const diagHeaders: Record<string, string> = {}
        for (const name of [
            'x-request-id',
            'x-ratelimit-limit',
            'x-ratelimit-remaining',
            'x-ratelimit-reset',
            'retry-after',
            'cf-ray',
        ]) {
            const val = response.headers.get(name)
            if (val) diagHeaders[name] = val
        }
        if (Object.keys(diagHeaders).length > 0) {
            log.debug('response headers', diagHeaders)
        }

        // TRACE: all response headers
        if (log.isEnabled(Verbosity.TRACE)) {
            const allHeaders: Record<string, string> = {}
            response.headers.forEach((value, name) => {
                if (!name.toLowerCase().includes('set-cookie')) {
                    allHeaders[name] = value
                }
            })
            log.trace('all response headers', allHeaders)
        }

        return response
    }
}

/** Reset for testing. */
export function resetLogger(): void {
    logger = null
}
