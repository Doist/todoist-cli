import { randomUUID } from 'node:crypto'
import packageJson from '../../package.json' with { type: 'json' }

type CustomFetchResponse = {
    ok: boolean
    status: number
    statusText: string
    headers: Record<string, string>
    text(): Promise<string>
    json(): Promise<unknown>
}

type CustomFetch = (
    url: string,
    options?: RequestInit & { timeout?: number },
) => Promise<CustomFetchResponse>

const CLI_NAME = 'todoist-cli'
const CLI_VERSION = packageJson.version
const INVOCATION_ID = randomUUID()

let activeCommandPath: string | undefined

export function detectAiAgent(env: NodeJS.ProcessEnv = process.env): string | undefined {
    // Best-effort analytics only. There is no cross-vendor standard for
    // "which agent launched this process", and most of these environment
    // variables are observable implementation details rather than documented
    // public contracts. This list mirrors Stripe CLI's upstream detector:
    // https://github.com/stripe/stripe-cli/blob/master/pkg/useragent/useragent.go
    //
    // When adding new entries, prefer a public upstream source that shows the
    // variable being set or consumed.
    if (env.ANTIGRAVITY_CLI_ALIAS) return 'antigravity'
    if (env.CLAUDECODE) return 'claude_code'
    if (env.CLINE_ACTIVE) return 'cline'
    if (
        env.CODEX_SANDBOX ||
        env.CODEX_THREAD_ID ||
        env.CODEX_SANDBOX_NETWORK_DISABLED ||
        env.CODEX_CI
    ) {
        return 'codex_cli'
    }
    if (env.CURSOR_AGENT) return 'cursor'
    if (env.GEMINI_CLI) return 'gemini_cli'
    if (env.OPENCODE) return 'open_code'
    if (env.OPENCLAW_SHELL) return 'openclaw'
    return undefined
}

function getUserAgent(): string {
    return `${CLI_NAME}/${CLI_VERSION}`
}

export function normalizeCommandPath(commandPath: string): string {
    return commandPath
        .replace(/^td\s+/, '')
        .trim()
        .replace(/\s+/g, '.')
}

export function setActiveCommandPath(commandPath: string | undefined): void {
    activeCommandPath = commandPath ? normalizeCommandPath(commandPath) : undefined
}

export function getActiveCommandPath(): string | undefined {
    return activeCommandPath
}

export function buildUsageTrackingHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
        'User-Agent': getUserAgent(),
        'X-Todoist-Client': CLI_NAME,
        'X-Todoist-CLI-Version': CLI_VERSION,
        'X-Todoist-CLI-Invocation-Id': INVOCATION_ID,
    }

    if (activeCommandPath) {
        headers['X-Todoist-CLI-Command'] = activeCommandPath
    }

    const aiAgent = detectAiAgent()
    if (aiAgent) {
        headers['X-Todoist-CLI-AI-Agent'] = aiAgent
    }

    return headers
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
        const { timeout: _timeout, headers, ...rest } = options
        const mergedHeaders = new Headers(headers)
        for (const [key, value] of Object.entries(buildUsageTrackingHeaders())) {
            mergedHeaders.set(key, value)
        }
        const response = await baseFetch(url, {
            ...rest,
            headers: Object.fromEntries(mergedHeaders.entries()),
        })
        return toCustomFetchResponse(response)
    }
}

export function resetUsageTrackingForTests(): void {
    activeCommandPath = undefined
}
